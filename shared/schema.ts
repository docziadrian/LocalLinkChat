import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - community members with profiles
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  fullName: text("full_name"),
  jobPosition: text("job_position"),
  bio: text("bio"),
  seekingDescription: text("seeking_description"),
  avatarUrl: text("avatar_url"),
  interests: text("interests", { mode: "json" }).$type<string[]>().default([]),
  isOnline: integer("is_online", { mode: "boolean" }).default(false),
  profileCompleted: integer("profile_completed", { mode: "boolean" }).default(false),
  preferredLanguage: text("preferred_language").default("en"),
  googleId: text("google_id"),
  createdAt: text("created_at").notNull(),
  lastLoginAt: text("last_login_at"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Magic link tokens for authentication
export const magicLinkTokens = sqliteTable("magic_link_tokens", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  used: integer("used", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

export const insertMagicLinkTokenSchema = createInsertSchema(magicLinkTokens).omit({ id: true });
export type InsertMagicLinkToken = z.infer<typeof insertMagicLinkTokenSchema>;
export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;

// Sessions table for user sessions
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Connections between users
export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  requesterId: text("requester_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, declined
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertConnectionSchema = createInsertSchema(connections).omit({ id: true });
export type InsertConnection = z.infer<typeof insertConnectionSchema>;
export type Connection = typeof connections.$inferSelect;

// Notifications for connection requests and other events
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // connection_request, connection_accepted, message
  fromUserId: text("from_user_id"),
  connectionId: text("connection_id"),
  message: text("message"),
  read: integer("read", { mode: "boolean" }).default(false),
  createdAt: text("created_at").notNull(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Chat messages for live support
export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  isSupport: integer("is_support", { mode: "boolean" }).default(false),
  timestamp: text("timestamp").notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Direct messages between users
export const directMessages = sqliteTable("direct_messages", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull(),
  receiverId: text("receiver_id").notNull(),
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).default(false),
});

export const insertDirectMessageSchema = createInsertSchema(directMessages).omit({ id: true });
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;
export type DirectMessage = typeof directMessages.$inferSelect;

// Posts table - user content/stories
export const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
});

export const insertPostSchema = createInsertSchema(posts).omit({ id: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

// Post likes/dislikes table
export const postLikes = sqliteTable("post_likes", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(), // 'like' or 'dislike'
  createdAt: text("created_at").notNull(),
});

export const insertPostLikeSchema = createInsertSchema(postLikes).omit({ id: true });
export type InsertPostLike = z.infer<typeof insertPostLikeSchema>;
export type PostLike = typeof postLikes.$inferSelect;

// Post comments table
export const postComments = sqliteTable("post_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertPostCommentSchema = createInsertSchema(postComments).omit({ id: true });
export type InsertPostComment = z.infer<typeof insertPostCommentSchema>;
export type PostComment = typeof postComments.$inferSelect;

// Activity feed items
export interface ActivityItem {
  id: string;
  type: "new_member" | "new_connection" | "interest_match";
  userId: string;
  userName: string;
  userAvatar?: string;
  targetUserId?: string;
  targetUserName?: string;
  targetUserAvatar?: string;
  timestamp: string;
  interests?: string[];
}

// Interest categories
export const INTEREST_CATEGORIES = [
  "Networking",
  "Marketing",
  "Technology",
  "E-commerce",
  "Finance",
  "Real Estate",
  "Healthcare",
  "Retail",
  "Consulting",
  "Manufacturing",
  "Food & Beverage",
  "Professional Services",
  "Creative & Design",
  "Education",
  "Sustainability",
] as const;

export type InterestCategory = typeof INTEREST_CATEGORIES[number];

// Supported languages
export const SUPPORTED_LANGUAGES = ["en", "hu", "de"] as const;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
