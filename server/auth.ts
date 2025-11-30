import { Router, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { randomUUID, randomBytes, createHash } from "crypto";
import nodemailer from "nodemailer";

const router = Router();

// Create a session cookie name
const SESSION_COOKIE = "llc_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Email transporter (configure with your SMTP settings)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

// Generate a secure token
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// Hash a token for storage
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Middleware to get current user from session
export async function getCurrentUser(req: Request): Promise<any | null> {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) return null;

  const session = await storage.getSession(sessionId);
  if (!session) return null;

  // Check if session is expired
  if (new Date(session.expiresAt) < new Date()) {
    await storage.deleteSession(sessionId);
    return null;
  }

  return storage.getUser(session.userId);
}

// Auth middleware
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  (req as any).user = user;
  next();
}

// Check if user has completed profile
export async function requireProfileComplete(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user.profileCompleted) {
    return res.status(403).json({ error: "Profile not completed", code: "PROFILE_INCOMPLETE" });
  }
  next();
}

// Request Magic Link
router.post("/magic-link", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const token = generateToken();
    const hashedToken = hashToken(token);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

    // Store the hashed token
    await storage.createMagicLinkToken({
      email: normalizedEmail,
      token: hashedToken,
      expiresAt,
      used: false,
      createdAt: new Date().toISOString(),
    });

    // Build the magic link URL
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const magicLink = `${baseUrl}/api/auth/verify?token=${token}&email=${encodeURIComponent(normalizedEmail)}`;

    // Send email (or log for development)
    if (process.env.SMTP_USER) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || "LocalLinkChat <noreply@locallinkchat.com>",
        to: normalizedEmail,
        subject: "Sign in to LocalLinkChat",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Welcome to LocalLinkChat!</h1>
            <p>Click the button below to sign in:</p>
            <a href="${magicLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
              Sign In
            </a>
            <p style="color: #666; font-size: 14px;">This link expires in 15 minutes.</p>
            <p style="color: #666; font-size: 12px;">If you didn't request this email, you can safely ignore it.</p>
          </div>
        `,
      });
    } else {
      console.log("\n=== Magic Link (Development Mode) ===");
      console.log(`Email: ${normalizedEmail}`);
      console.log(`Link: ${magicLink}`);
      console.log("=====================================\n");
    }

    res.json({ success: true, message: "Magic link sent to your email" });
  } catch (error) {
    console.error("Magic link error:", error);
    res.status(500).json({ error: "Failed to send magic link" });
  }
});

// Verify Magic Link
router.get("/verify", async (req: Request, res: Response) => {
  try {
    const { token, email } = req.query;
    
    if (!token || !email || typeof token !== "string" || typeof email !== "string") {
      return res.redirect("/?error=invalid_link");
    }

    const hashedToken = hashToken(token);
    const magicLinkToken = await storage.getMagicLinkToken(hashedToken);

    if (!magicLinkToken) {
      return res.redirect("/?error=invalid_or_expired_link");
    }

    if (new Date(magicLinkToken.expiresAt) < new Date()) {
      return res.redirect("/?error=link_expired");
    }

    if (magicLinkToken.email !== email.toLowerCase()) {
      return res.redirect("/?error=invalid_link");
    }

    // Mark token as used
    await storage.markMagicLinkTokenUsed(magicLinkToken.id);

    // Find or create user
    let user = await storage.getUserByEmail(email.toLowerCase());
    
    if (!user) {
      // Create new user
      user = await storage.createUser({
        email: email.toLowerCase(),
        name: email.split("@")[0],
        interests: [],
        isOnline: true,
        profileCompleted: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      });
    } else {
      // Update last login
      await storage.updateUser(user.id, {
        lastLoginAt: new Date().toISOString(),
        isOnline: true,
      });
    }

    // Create session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    
    const session = await storage.createSession({
      userId: user.id,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    // Set session cookie using the session ID from database
    res.cookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS,
    });

    // Redirect based on profile completion
    if (user.profileCompleted) {
      res.redirect("/");
    } else {
      res.redirect("/setup");
    }
  } catch (error) {
    console.error("Verify error:", error);
    res.redirect("/?error=verification_failed");
  }
});

// Google OAuth callback handler (for client-side OAuth)
router.post("/google", async (req: Request, res: Response) => {
  try {
    const { credential, clientId } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    // Decode the JWT token from Google (in production, verify with Google's public keys)
    const parts = credential.split(".");
    if (parts.length !== 3) {
      return res.status(400).json({ error: "Invalid credential format" });
    }

    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
    
    const { sub: googleId, email, name, picture } = payload;

    if (!email) {
      return res.status(400).json({ error: "Email not provided by Google" });
    }

    // Find user by Google ID or email
    let user = await storage.getUserByGoogleId(googleId);
    
    if (!user) {
      user = await storage.getUserByEmail(email.toLowerCase());
      
      if (user) {
        // Link Google account to existing user
        await storage.updateUser(user.id, {
          googleId,
          avatarUrl: user.avatarUrl || picture,
        });
        user = await storage.getUser(user.id);
      } else {
        // Create new user
        user = await storage.createUser({
          email: email.toLowerCase(),
          name: name || email.split("@")[0],
          fullName: name,
          googleId,
          avatarUrl: picture,
          interests: [],
          isOnline: true,
          profileCompleted: false,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        });
      }
    } else {
      // Update last login
      await storage.updateUser(user.id, {
        lastLoginAt: new Date().toISOString(),
        isOnline: true,
        avatarUrl: user.avatarUrl || picture,
      });
      user = await storage.getUser(user.id);
    }

    // Create session
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    
    const session = await storage.createSession({
      userId: user!.id,
      expiresAt,
      createdAt: new Date().toISOString(),
    });

    // Set session cookie using the session ID from database
    res.cookie(SESSION_COOKIE, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION_MS,
    });

    res.json({ 
      success: true, 
      user: user,
      profileCompleted: user!.profileCompleted 
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(500).json({ error: "Google authentication failed" });
  }
});

// Get current user
router.get("/me", async (req: Request, res: Response) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

// Logout
router.post("/logout", async (req: Request, res: Response) => {
  try {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (sessionId) {
      const session = await storage.getSession(sessionId);
      if (session) {
        await storage.setUserOnline(session.userId, false);
      }
      await storage.deleteSession(sessionId);
    }
    
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// Complete profile setup
router.post("/setup", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { fullName, jobPosition, bio, seekingDescription, interests, preferredLanguage } = req.body;

    if (!fullName || !jobPosition || !interests || interests.length === 0) {
      return res.status(400).json({ 
        error: "Full name, job position, and at least one interest are required" 
      });
    }

    const updatedUser = await storage.updateUser(user.id, {
      fullName,
      name: fullName,
      jobPosition,
      bio: bio || "",
      seekingDescription: seekingDescription || "",
      interests,
      preferredLanguage: preferredLanguage || "en",
      profileCompleted: true,
    });

    // Create activity for new member
    await storage.createActivity({
      type: "new_member",
      userId: user.id,
      userName: fullName,
      userAvatar: user.avatarUrl || undefined,
      timestamp: new Date().toISOString(),
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Setup error:", error);
    res.status(500).json({ error: "Failed to complete profile setup" });
  }
});

export default router;

