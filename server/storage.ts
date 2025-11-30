import { db, initializeDatabase } from "./db";
import { 
  users, 
  magicLinkTokens, 
  sessions, 
  connections, 
  notifications,
  chatMessages, 
  directMessages,
  posts,
  postLikes,
  postComments,
  type User, 
  type InsertUser,
  type MagicLinkToken,
  type InsertMagicLinkToken,
  type Session,
  type InsertSession,
  type Connection, 
  type InsertConnection,
  type Notification,
  type InsertNotification,
  type ChatMessage,
  type InsertChatMessage,
  type DirectMessage,
  type InsertDirectMessage,
  type Post,
  type InsertPost,
  type PostLike,
  type InsertPostLike,
  type PostComment,
  type InsertPostComment,
  type ActivityItem
} from "@shared/schema";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

// Initialize database on module load
initializeDatabase();

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByInterests(interests: string[]): Promise<User[]>;
  setUserOnline(id: string, isOnline: boolean): Promise<void>;
  
  // Magic Link Tokens
  createMagicLinkToken(token: InsertMagicLinkToken): Promise<MagicLinkToken>;
  getMagicLinkToken(token: string): Promise<MagicLinkToken | undefined>;
  markMagicLinkTokenUsed(id: string): Promise<void>;
  
  // Sessions
  createSession(session: InsertSession): Promise<Session>;
  getSession(id: string): Promise<Session | undefined>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  
  // Connections
  getConnection(id: string): Promise<Connection | undefined>;
  getConnectionsByUser(userId: string): Promise<Connection[]>;
  getConnectionBetweenUsers(userId1: string, userId2: string): Promise<Connection | undefined>;
  createConnection(connection: InsertConnection): Promise<Connection>;
  updateConnectionStatus(id: string, status: string): Promise<Connection | undefined>;
  getAcceptedConnectionsCount(userId: string): Promise<number>;
  
  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationsCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  
  // Chat messages
  getChatMessages(): Promise<ChatMessage[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  
  // Direct messages
  getDirectMessages(userId: string, otherUserId: string): Promise<DirectMessage[]>;
  getDirectMessageConversations(userId: string): Promise<Array<{ 
    oderId: string; 
    otherUser: User;
    lastMessage?: string; 
    lastTimestamp?: string; 
    unreadCount: number 
  }>>;
  createDirectMessage(message: InsertDirectMessage): Promise<DirectMessage>;
  markDirectMessageAsRead(messageId: string): Promise<DirectMessage | undefined>;
  getDirectMessageCount(userId: string): Promise<number>;
  getUnreadDirectMessageCount(userId: string): Promise<number>;
  
  // Activities
  getActivities(): Promise<ActivityItem[]>;
  createActivity(activity: Omit<ActivityItem, "id">): Promise<ActivityItem>;
  
  // Posts
  getPosts(options?: { sortBy?: 'newest' | 'likes'; connectionIds?: string[] }): Promise<Array<Post & { user: User; likesCount: number; dislikesCount: number; commentsCount: number; userReaction?: 'like' | 'dislike' | null }>>;
  getPost(id: string): Promise<Post | undefined>;
  createPost(post: InsertPost): Promise<Post>;
  deletePost(id: string): Promise<void>;
  
  // Post likes
  getPostLike(postId: string, userId: string): Promise<PostLike | undefined>;
  createPostLike(like: InsertPostLike): Promise<PostLike>;
  updatePostLike(id: string, type: 'like' | 'dislike'): Promise<PostLike | undefined>;
  deletePostLike(postId: string, userId: string): Promise<void>;
  getPostLikesCount(postId: string): Promise<{ likes: number; dislikes: number }>;
  
  // Post comments
  getPostComments(postId: string): Promise<Array<PostComment & { user: User }>>;
  createPostComment(comment: InsertPostComment): Promise<PostComment>;
  deletePostComment(id: string): Promise<void>;
}

export class SQLiteStorage implements IStorage {
  private activities: Map<string, ActivityItem> = new Map();

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    return result[0];
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).where(eq(users.profileCompleted, true));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const interests = insertUser.interests ? [...insertUser.interests] : [];
    const user = { 
      ...insertUser, 
      id,
      email: insertUser.email.toLowerCase(),
      interests,
    };
    await db.insert(users).values(user as any);
    return user as User;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const updateData = { ...updates };
    if (updates.interests) {
      updateData.interests = [...updates.interests];
    }
    await db.update(users).set(updateData as any).where(eq(users.id, id));
    return this.getUser(id);
  }

  async getUsersByInterests(interests: string[]): Promise<User[]> {
    if (interests.length === 0) {
      return this.getAllUsers();
    }
    
    const allUsers = await this.getAllUsers();
    return allUsers.filter((user) =>
      user.interests?.some((interest) => interests.includes(interest))
    );
  }

  async setUserOnline(id: string, isOnline: boolean): Promise<void> {
    await db.update(users).set({ isOnline }).where(eq(users.id, id));
  }

  // Magic Link Tokens
  async createMagicLinkToken(insertToken: InsertMagicLinkToken): Promise<MagicLinkToken> {
    const id = randomUUID();
    const token = { ...insertToken, id };
    await db.insert(magicLinkTokens).values(token);
    return token as MagicLinkToken;
  }

  async getMagicLinkToken(token: string): Promise<MagicLinkToken | undefined> {
    const result = await db.select().from(magicLinkTokens)
      .where(and(
        eq(magicLinkTokens.token, token),
        eq(magicLinkTokens.used, false)
      ))
      .limit(1);
    return result[0];
  }

  async markMagicLinkTokenUsed(id: string): Promise<void> {
    await db.update(magicLinkTokens).set({ used: true }).where(eq(magicLinkTokens.id, id));
  }

  // Sessions
  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session = { ...insertSession, id };
    await db.insert(sessions).values(session);
    return session as Session;
  }

  async getSession(id: string): Promise<Session | undefined> {
    const result = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (result[0]) {
      // Check if session is expired
      if (new Date(result[0].expiresAt) < new Date()) {
        await this.deleteSession(id);
        return undefined;
      }
    }
    return result[0];
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  // Connections
  async getConnection(id: string): Promise<Connection | undefined> {
    const result = await db.select().from(connections).where(eq(connections.id, id)).limit(1);
    return result[0];
  }

  async getConnectionsByUser(userId: string): Promise<Connection[]> {
    return db.select().from(connections)
      .where(or(
        eq(connections.requesterId, userId),
        eq(connections.receiverId, userId)
      ));
  }

  async getConnectionBetweenUsers(userId1: string, userId2: string): Promise<Connection | undefined> {
    const result = await db.select().from(connections)
      .where(or(
        and(eq(connections.requesterId, userId1), eq(connections.receiverId, userId2)),
        and(eq(connections.requesterId, userId2), eq(connections.receiverId, userId1))
      ))
      .limit(1);
    return result[0];
  }

  async createConnection(insertConnection: InsertConnection): Promise<Connection> {
    const id = randomUUID();
    const connection = { 
      ...insertConnection, 
      id,
      createdAt: new Date().toISOString()
    };
    await db.insert(connections).values(connection);
    return connection as Connection;
  }

  async updateConnectionStatus(id: string, status: string): Promise<Connection | undefined> {
    await db.update(connections)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(connections.id, id));
    return this.getConnection(id);
  }

  async getAcceptedConnectionsCount(userId: string): Promise<number> {
    const userConnections = await this.getConnectionsByUser(userId);
    return userConnections.filter(c => c.status === "accepted").length;
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationsCount(userId: string): Promise<number> {
    const result = await db.select().from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ));
    return result.length;
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const id = randomUUID();
    const notification = { ...insertNotification, id };
    await db.insert(notifications).values(notification);
    return notification as Notification;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(eq(notifications.userId, userId));
  }

  // Chat messages
  async getChatMessages(): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).orderBy(chatMessages.timestamp);
  }

  async createChatMessage(insertMessage: InsertChatMessage): Promise<ChatMessage> {
    const id = randomUUID();
    const message = { ...insertMessage, id };
    await db.insert(chatMessages).values(message);
    return message as ChatMessage;
  }

  // Direct messages
  async getDirectMessages(userId: string, otherUserId: string): Promise<DirectMessage[]> {
    return db.select().from(directMessages)
      .where(or(
        and(eq(directMessages.senderId, userId), eq(directMessages.receiverId, otherUserId)),
        and(eq(directMessages.senderId, otherUserId), eq(directMessages.receiverId, userId))
      ))
      .orderBy(directMessages.timestamp);
  }

  async getDirectMessageConversations(userId: string): Promise<Array<{ 
    oderId: string; 
    otherUser: User;
    lastMessage?: string; 
    lastTimestamp?: string; 
    unreadCount: number 
  }>> {
    const messages = await db.select().from(directMessages)
      .where(or(
        eq(directMessages.senderId, userId),
        eq(directMessages.receiverId, userId)
      ))
      .orderBy(desc(directMessages.timestamp));

    const conversations = new Map<string, { 
      oderId: string;
      otherUser: User;
      lastMessage?: string; 
      lastTimestamp?: string; 
      unreadCount: number 
    }>();

    for (const msg of messages) {
      const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!conversations.has(otherUserId)) {
        const otherUser = await this.getUser(otherUserId);
        if (otherUser) {
          conversations.set(otherUserId, {
            oderId: otherUserId,
            otherUser,
            lastMessage: msg.content,
            lastTimestamp: msg.timestamp,
            unreadCount: 0,
          });
        }
      }
      const conv = conversations.get(otherUserId);
      if (conv && msg.receiverId === userId && !msg.isRead) {
        conv.unreadCount++;
      }
    }

    return Array.from(conversations.values());
  }

  async createDirectMessage(insertMessage: InsertDirectMessage): Promise<DirectMessage> {
    const id = randomUUID();
    const message = { ...insertMessage, id };
    await db.insert(directMessages).values(message);
    return message as DirectMessage;
  }

  async markDirectMessageAsRead(messageId: string): Promise<DirectMessage | undefined> {
    await db.update(directMessages).set({ isRead: true }).where(eq(directMessages.id, messageId));
    const result = await db.select().from(directMessages).where(eq(directMessages.id, messageId)).limit(1);
    return result[0];
  }

  async getDirectMessageCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(directMessages)
      .where(eq(directMessages.senderId, userId));
    return result[0]?.count || 0;
  }

  async getUnreadDirectMessageCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(directMessages)
      .where(and(
        eq(directMessages.receiverId, userId),
        eq(directMessages.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  // Activities
  async getActivities(): Promise<ActivityItem[]> {
    return Array.from(this.activities.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async createActivity(activity: Omit<ActivityItem, "id">): Promise<ActivityItem> {
    const id = randomUUID();
    const newActivity: ActivityItem = { ...activity, id };
    this.activities.set(id, newActivity);
    return newActivity;
  }

  // Posts
  async getPosts(options?: { sortBy?: 'newest' | 'likes'; connectionIds?: string[]; currentUserId?: string }): Promise<Array<Post & { user: User; likesCount: number; dislikesCount: number; commentsCount: number; userReaction?: 'like' | 'dislike' | null }>> {
    let allPosts = await db.select().from(posts).orderBy(desc(posts.createdAt));
    
    // Filter by connections if specified
    if (options?.connectionIds && options.connectionIds.length > 0) {
      allPosts = allPosts.filter(post => options.connectionIds!.includes(post.userId));
    }
    
    const enrichedPosts = await Promise.all(allPosts.map(async (post) => {
      const user = await this.getUser(post.userId);
      const likeCounts = await this.getPostLikesCount(post.id);
      const comments = await db.select().from(postComments).where(eq(postComments.postId, post.id));
      
      let userReaction: 'like' | 'dislike' | null = null;
      if (options?.currentUserId) {
        const reaction = await this.getPostLike(post.id, options.currentUserId);
        userReaction = reaction?.type as 'like' | 'dislike' | null;
      }
      
      return {
        ...post,
        user: user!,
        likesCount: likeCounts.likes,
        dislikesCount: likeCounts.dislikes,
        commentsCount: comments.length,
        userReaction,
      };
    }));
    
    // Sort by likes if specified
    if (options?.sortBy === 'likes') {
      enrichedPosts.sort((a, b) => b.likesCount - a.likesCount);
    }
    
    return enrichedPosts;
  }

  async getPost(id: string): Promise<Post | undefined> {
    const result = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
    return result[0];
  }

  async createPost(insertPost: InsertPost): Promise<Post> {
    const id = randomUUID();
    const post = { ...insertPost, id };
    await db.insert(posts).values(post);
    return post as Post;
  }

  async deletePost(id: string): Promise<void> {
    // Delete all related likes and comments first
    await db.delete(postLikes).where(eq(postLikes.postId, id));
    await db.delete(postComments).where(eq(postComments.postId, id));
    await db.delete(posts).where(eq(posts.id, id));
  }

  // Post likes
  async getPostLike(postId: string, userId: string): Promise<PostLike | undefined> {
    const result = await db.select().from(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)))
      .limit(1);
    return result[0];
  }

  async createPostLike(insertLike: InsertPostLike): Promise<PostLike> {
    const id = randomUUID();
    const like = { ...insertLike, id };
    await db.insert(postLikes).values(like);
    return like as PostLike;
  }

  async updatePostLike(id: string, type: 'like' | 'dislike'): Promise<PostLike | undefined> {
    await db.update(postLikes).set({ type }).where(eq(postLikes.id, id));
    const result = await db.select().from(postLikes).where(eq(postLikes.id, id)).limit(1);
    return result[0];
  }

  async deletePostLike(postId: string, userId: string): Promise<void> {
    await db.delete(postLikes)
      .where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId)));
  }

  async getPostLikesCount(postId: string): Promise<{ likes: number; dislikes: number }> {
    const allLikes = await db.select().from(postLikes).where(eq(postLikes.postId, postId));
    const likes = allLikes.filter(l => l.type === 'like').length;
    const dislikes = allLikes.filter(l => l.type === 'dislike').length;
    return { likes, dislikes };
  }

  // Post comments
  async getPostComments(postId: string): Promise<Array<PostComment & { user: User }>> {
    const comments = await db.select().from(postComments)
      .where(eq(postComments.postId, postId))
      .orderBy(postComments.createdAt);
    
    return Promise.all(comments.map(async (comment) => {
      const user = await this.getUser(comment.userId);
      return { ...comment, user: user! };
    }));
  }

  async createPostComment(insertComment: InsertPostComment): Promise<PostComment> {
    const id = randomUUID();
    const comment = { ...insertComment, id };
    await db.insert(postComments).values(comment);
    return comment as PostComment;
  }

  async deletePostComment(id: string): Promise<void> {
    await db.delete(postComments).where(eq(postComments.id, id));
  }
}

export const storage = new SQLiteStorage();
