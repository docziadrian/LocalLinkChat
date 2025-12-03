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
const shortVideosDir = path.join(process.cwd(), "short_videos");

if (!fs.existsSync(profileUploadDir)) {
  fs.mkdirSync(profileUploadDir, { recursive: true });
}
if (!fs.existsSync(postUploadDir)) {
  fs.mkdirSync(postUploadDir, { recursive: true });
}
if (!fs.existsSync(shortVideosDir)) {
  fs.mkdirSync(shortVideosDir, { recursive: true });
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

// Configure multer for short videos
const videoFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only MP4, WebM, MOV, and AVI are allowed."));
  }
};

const shortVideoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, shortVideosDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${randomUUID()}${ext}`;
    cb(null, filename);
  },
});

const shortVideoUpload = multer({
  storage: shortVideoStorage,
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for short videos
    fieldSize: 200 * 1024 * 1024, // 200MB limit for field size
  },
});

// Upload short video
router.post("/short-video", requireAuth, shortVideoUpload.single("video"), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      console.error("Short video upload: No file in request");
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Check file size
    const maxSize = 200 * 1024 * 1024; // 200MB
    /*
    if (file.size > maxSize) {
      return res.status(413).json({ 
        error: "File too large", 
        details: `Maximum file size is ${maxSize / (1024 * 1024)}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.` 
      });
    }
      */

    // Verify the file was saved correctly
    const filePath = path.join(shortVideosDir, file.filename);
    if (!fs.existsSync(filePath)) {
      console.error(`Short video upload: File not found at ${filePath}`);
      return res.status(500).json({ error: "File save failed" });
    }

    // Return relative URL (works in both dev and production)
    const videoUrl = `/short_videos/${file.filename}`;

    console.log(`Short video uploaded successfully: ${videoUrl}, size: ${file.size} bytes`);

    res.json({ 
      success: true, 
      videoUrl,
      filename: file.filename,
      size: file.size,
    });
  } catch (error: any) {
    console.error("Short video upload error:", error.message || error);
    
    // Handle multer errors specifically
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: "File too large", 
        details: "Maximum file size is 200MB. Please choose a smaller video file." 
      });
    }
    
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        error: "Invalid file field", 
        details: "Please use the 'video' field name for the file upload." 
      });
    }
    
    res.status(500).json({ 
      error: "Failed to upload short video", 
      details: error.message || "An unexpected error occurred" 
    });
  }
});

// Upload short thumbnail
router.post("/short-thumbnail", requireAuth, postImageUpload.single("thumbnail"), async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const thumbnailUrl = `/post_images/${file.filename}`;

    res.json({ 
      success: true, 
      thumbnailUrl,
    });
  } catch (error) {
    console.error("Short thumbnail upload error:", error);
    res.status(500).json({ error: "Failed to upload thumbnail" });
  }
});

export default router;

