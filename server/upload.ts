import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { requireAuth, getCurrentUser } from "./auth";
import { storage } from "./storage";

const router = Router();

// Ensure upload directories exist
const profileUploadDir = path.join(process.cwd(), "profile_pictures");
const postUploadDir = path.join(process.cwd(), "post_images");

if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, { recursive: true });
}
if (!fs.existsSync(postUploadDir)) {
  fs.mkdirSync(postUploadDir, { recursive: true });
}

const uploadDir = profileUploadDir;

// Configure multer for file uploads
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed."));
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Upload profile picture
router.post("/profile-picture", requireAuth, upload.single("avatar"), async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Delete old profile picture if it exists and is a local file
    if (user.avatarUrl && user.avatarUrl.startsWith("/profile_pictures/")) {
      const oldPath = path.join(process.cwd(), user.avatarUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Update user with new avatar URL
    const avatarUrl = `/profile_pictures/${file.filename}`;
    const updatedUser = await storage.updateUser(user.id, { avatarUrl });

    res.json({ 
      success: true, 
      avatarUrl,
      user: updatedUser 
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload profile picture" });
  }
});

// Delete profile picture
router.delete("/profile-picture", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Delete file if it's a local file
    if (user.avatarUrl && user.avatarUrl.startsWith("/profile_pictures/")) {
      const filePath = path.join(process.cwd(), user.avatarUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Update user to remove avatar
    const updatedUser = await storage.updateUser(user.id, { avatarUrl: null });

    res.json({ 
      success: true, 
      user: updatedUser 
    });
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: "Failed to delete profile picture" });
  }
});

// Configure multer for post images
const postImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, postUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

const postImageUpload = multer({
  storage: postImageStorage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for post images
  },
});

// Upload post image
router.post("/post-image", requireAuth, postImageUpload.single("image"), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const url = `/post_images/${file.filename}`;

    res.json({ 
      success: true, 
      url,
    });
  } catch (error) {
    console.error("Post image upload error:", error);
    res.status(500).json({ error: "Failed to upload post image" });
  }
});

export default router;

