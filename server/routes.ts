import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cookieParser from "cookie-parser";
import express from "express";
import path from "path";
import { storage } from "./storage";
import authRouter, { requireAuth, getCurrentUser } from "./auth";
import uploadRouter from "./upload";
import { randomUUID } from "crypto";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Middleware
  app.use(cookieParser());
  
  // Serve profile pictures statically
  app.use("/profile_pictures", express.static(path.join(process.cwd(), "profile_pictures")));
  
  // Auth routes
  app.use("/api/auth", authRouter);

  // Public config endpoint (for runtime environment variables)
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      googleClientId: process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
    });
  });
  
  // Upload routes
  app.use("/api/upload", uploadRouter);

  // WebSocket server for live chat and direct messages
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  const clients = new Set<WebSocket>();
  const userConnections = new Map<string, WebSocket>();

  wss.on("connection", (ws) => {
    let userId: string | null = null;
    clients.add(ws);

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === "connect") {
          userId = data.userId;
          if (userId) {
            userConnections.set(userId, ws);
            await storage.setUserOnline(userId, true);
            
            // Broadcast online status
            broadcastToAll({
              type: "user_online",
              userId,
            });
          }
          return;
        }
        
        if (data.type === "direct_message" && userId) {
          const { receiverId, content } = data;
          
          // Check if users are connected
          const connection = await storage.getConnectionBetweenUsers(userId, receiverId);
          if (!connection || connection.status !== "accepted") {
            ws.send(JSON.stringify({
              type: "error",
              message: "You can only message users you are connected with",
            }));
            return;
          }
          
          const sender = await storage.getUser(userId);
          const dmMessage = await storage.createDirectMessage({
            senderId: userId,
            receiverId,
            content,
            timestamp: new Date().toISOString(),
            isRead: false,
          });
          
          // Send to receiver if online
          const recipientWs = userConnections.get(receiverId);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify({
              type: "direct_message",
              data: {
                ...dmMessage,
                sender,
              },
            }));
          }
          
          // Send confirmation to sender
          ws.send(JSON.stringify({
            type: "direct_message_sent",
            data: dmMessage,
          }));
          return;
        }
        
        if (data.type === "chat" && userId) {
          const sender = await storage.getUser(userId);
          if (!sender) return;
          
          const chatMessage = {
            id: randomUUID(),
            senderId: userId,
            senderName: sender.name || "Anonymous",
            content: data.content,
            isSupport: false,
            timestamp: new Date().toISOString(),
          };

          // Store the message
          await storage.createChatMessage(chatMessage);

          // Broadcast to sender
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "chat", data: chatMessage }));
          }

          // Simulate support response after a delay
          setTimeout(async () => {
            const responses = [
              "Thanks for reaching out! I'd be happy to help you with that.",
              "Great question! Let me provide some information about our community features.",
              "I understand. You can find similar professionals in the Discover section.",
              "That's a common question! You can update your interests in your profile settings.",
              "Absolutely! We encourage connecting with professionals who share your interests.",
            ];
            
            const supportResponse = {
              id: randomUUID(),
              senderId: "support",
              senderName: "Support Team",
              content: responses[Math.floor(Math.random() * responses.length)],
              isSupport: true,
              timestamp: new Date().toISOString(),
            };

            await storage.createChatMessage(supportResponse);

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "chat", data: supportResponse }));
            }
          }, 1500);
        }
        
        if (data.type === "typing" && userId) {
          const { receiverId, isTyping } = data;
          const recipientWs = userConnections.get(receiverId);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify({
              type: "typing",
              userId,
              isTyping,
            }));
          }
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", async () => {
      clients.delete(ws);
      if (userId) {
        userConnections.delete(userId);
        await storage.setUserOnline(userId, false);
        
        // Broadcast offline status
        broadcastToAll({
          type: "user_offline",
          userId,
        });
      }
    });
  });

  function broadcastToAll(message: any) {
    const messageStr = JSON.stringify(message);
    clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // Get current user
  app.get("/api/users/me", async (req: Request, res: Response) => {
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

  // Update current user
  app.patch("/api/users/me", async (req: Request, res: Response) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const updates = req.body;
      const updatedUser = await storage.updateUser(user.id, updates);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Get all users (only completed profiles)
  app.get("/api/users", async (req: Request, res: Response) => {
    try {
      const interests = req.query.interests as string | undefined;
      const search = req.query.search as string | undefined;
      
      let users = interests 
        ? await storage.getUsersByInterests(interests.split(","))
        : await storage.getAllUsers();

      if (search) {
        const searchLower = search.toLowerCase();
        users = users.filter(
          (user) =>
            user.name?.toLowerCase().includes(searchLower) ||
            user.fullName?.toLowerCase().includes(searchLower) ||
            user.jobPosition?.toLowerCase().includes(searchLower)
        );
      }

      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to get users" });
    }
  });

  // Get user recommendations
  // Get posts by user ID - MUST be before :id route
  app.get("/api/users/:userId/posts", async (req: Request, res: Response) => {
    try {
      const posts = await storage.getPostsByUserId(req.params.userId);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user posts" });
    }
  });

  // Get REALS by user ID - MUST be before :id route
  app.get("/api/users/:userId/reals", async (req: Request, res: Response) => {
    try {
      const reals = await storage.getShortsByUserId(req.params.userId);
      res.json(reals);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user REALS" });
    }
  });

  app.get("/api/users/recommendations", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      let users = await storage.getAllUsers();
      
      // Filter out current user
      users = users.filter((u) => u.id !== currentUser.id);

      // Sort by number of shared interests
      users.sort((a, b) => {
        const aMatches = (a.interests || []).filter((i) => 
          (currentUser.interests || []).includes(i)
        ).length;
        const bMatches = (b.interests || []).filter((i) => 
          (currentUser.interests || []).includes(i)
        ).length;
        return bMatches - aMatches;
      });

      res.json(users.slice(0, 6));
    } catch (error) {
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });

  // Get specific user
  app.get("/api/users/:id", async (req: Request, res: Response) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Get dashboard stats
  app.get("/api/stats", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const connections = await storage.getConnectionsByUser(currentUser.id);
      const acceptedConnections = connections.filter(c => c.status === "accepted").length;
      const pendingRequests = connections.filter(
        c => c.status === "pending" && c.receiverId === currentUser.id
      ).length;

      // Calculate messages count as engagement metric
      const messages = await storage.getDirectMessageCount(currentUser.id);
      
      res.json({
        totalConnections: acceptedConnections,
        pendingRequests,
        messagesSent: messages,
        matchScore: (currentUser.interests || []).length 
          ? Math.min(100, (currentUser.interests || []).length * 15)
          : 0,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get stats" });
    }
  });

  // Get connections
  app.get("/api/connections", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const connections = await storage.getConnectionsByUser(currentUser.id);
      res.json(connections);
    } catch (error) {
      res.status(500).json({ error: "Failed to get connections" });
    }
  });

  // Get accepted connections with user data
  app.get("/api/connections/accepted", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const connections = await storage.getConnectionsByUser(currentUser.id);
      const acceptedConnections = connections.filter(c => c.status === "accepted");
      
      const connectionsWithUsers = await Promise.all(
        acceptedConnections.map(async (conn) => {
          const otherUserId = conn.requesterId === currentUser.id ? conn.receiverId : conn.requesterId;
          const otherUser = await storage.getUser(otherUserId);
          return {
            ...conn,
            otherUser,
          };
        })
      );
      
      res.json(connectionsWithUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to get connections" });
    }
  });

  // Create connection request
  app.post("/api/connections", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { receiverId } = req.body;

      if (!receiverId) {
        return res.status(400).json({ error: "Receiver ID is required" });
      }

      // Check if connection already exists
      const existing = await storage.getConnectionBetweenUsers(currentUser.id, receiverId);
      if (existing) {
        return res.status(400).json({ error: "Connection already exists" });
      }

      const connection = await storage.createConnection({
        requesterId: currentUser.id,
        receiverId,
        status: "pending",
        createdAt: new Date().toISOString(),
      });

      // Create notification for receiver
      await storage.createNotification({
        userId: receiverId,
        type: "connection_request",
        fromUserId: currentUser.id,
        connectionId: connection.id,
        message: `${currentUser.name || currentUser.fullName} wants to connect with you`,
        read: false,
        createdAt: new Date().toISOString(),
      });

      // Notify via WebSocket if user is online
      const receiverWs = userConnections.get(receiverId);
      if (receiverWs && receiverWs.readyState === WebSocket.OPEN) {
        receiverWs.send(JSON.stringify({
          type: "notification",
          data: {
            type: "connection_request",
            fromUser: currentUser,
            connectionId: connection.id,
          },
        }));
      }

      res.json(connection);
    } catch (error) {
      res.status(500).json({ error: "Failed to create connection" });
    }
  });

  // Update connection status (accept/decline)
  app.patch("/api/connections/:id", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { status } = req.body;
      
      if (!["accepted", "declined"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const connection = await storage.getConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }

      // Only the receiver can accept/decline
      if (connection.receiverId !== currentUser.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updatedConnection = await storage.updateConnectionStatus(req.params.id, status);

      // Delete the original connection_request notification sent to the receiver (current user)
      await storage.deleteNotificationByConnectionId(req.params.id);

      if (status === "accepted") {
        // Create notification for the requester
        await storage.createNotification({
          userId: connection.requesterId,
          type: "connection_accepted",
          fromUserId: currentUser.id,
          connectionId: connection.id,
          message: `${currentUser.name || currentUser.fullName} accepted your connection request`,
          read: false,
          createdAt: new Date().toISOString(),
        });

        // Create activity
        const requester = await storage.getUser(connection.requesterId);
        if (requester) {
          await storage.createActivity({
            type: "new_connection",
            userId: currentUser.id,
            userName: currentUser.name || currentUser.fullName || "User",
            userAvatar: currentUser.avatarUrl || undefined,
            targetUserId: requester.id,
            targetUserName: requester.name || requester.fullName || "User",
            targetUserAvatar: requester.avatarUrl || undefined,
            timestamp: new Date().toISOString(),
          });
        }

        // Notify via WebSocket
        const requesterWs = userConnections.get(connection.requesterId);
        if (requesterWs && requesterWs.readyState === WebSocket.OPEN) {
          requesterWs.send(JSON.stringify({
            type: "notification",
            data: {
              type: "connection_accepted",
              fromUser: currentUser,
              connectionId: connection.id,
            },
          }));
        }
      }

      res.json(updatedConnection);
    } catch (error) {
      res.status(500).json({ error: "Failed to update connection" });
    }
  });

  // Delete connection (remove)
  app.delete("/api/connections/:id", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const connection = await storage.getConnection(req.params.id);
      if (!connection) {
        return res.status(404).json({ error: "Connection not found" });
      }

      // Only participants can delete the connection
      if (connection.requesterId !== currentUser.id && connection.receiverId !== currentUser.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteConnection(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete connection" });
    }
  });

  // Get notifications
  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const notifications = await storage.getNotifications(currentUser.id);
      
      // Populate with user data
      const notificationsWithUsers = await Promise.all(
        notifications.map(async (notification) => {
          if (notification.fromUserId) {
            const fromUser = await storage.getUser(notification.fromUserId);
            const connectionsCount = fromUser 
              ? await storage.getAcceptedConnectionsCount(fromUser.id)
              : 0;
            return {
              ...notification,
              fromUser: fromUser ? {
                ...fromUser,
                connectionsCount,
              } : null,
            };
          }
          return notification;
        })
      );
      
      res.json(notificationsWithUsers);
    } catch (error) {
      res.status(500).json({ error: "Failed to get notifications" });
    }
  });

  // Mark notification as read
  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Mark all notifications as read
  app.post("/api/notifications/read-all", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      await storage.markAllNotificationsRead(currentUser.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark notifications as read" });
    }
  });

  // Get unread notifications count
  app.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const count = await storage.getUnreadNotificationsCount(currentUser.id);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  // Get activities
  app.get("/api/activities", async (req: Request, res: Response) => {
    try {
      const activities = await storage.getActivities();
      res.json(activities.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: "Failed to get activities" });
    }
  });

  // Get conversations for current user
  app.get("/api/messages/conversations", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const conversations = await storage.getDirectMessageConversations(currentUser.id);
      res.json(conversations);
    } catch (error) {
      res.status(500).json({ error: "Failed to get conversations" });
    }
  });

  // Get unread messages count - MUST be before :userId route
  app.get("/api/messages/unread-count", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      const count = await storage.getUnreadDirectMessageCount(currentUser.id);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  // Get messages between current user and another user
  app.get("/api/messages/:userId", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const otherUserId = req.params.userId;
      
      // Check if users are connected
      const connection = await storage.getConnectionBetweenUsers(currentUser.id, otherUserId);
      if (!connection || connection.status !== "accepted") {
        return res.status(403).json({ error: "You can only view messages with connected users" });
      }
      
      const messages = await storage.getDirectMessages(currentUser.id, otherUserId);
      
      // Mark messages as read
      for (const msg of messages) {
        if (msg.receiverId === currentUser.id && !msg.isRead) {
          await storage.markDirectMessageAsRead(msg.id);
        }
      }
      
      // Fetch reactions for each message
      const messagesWithReactions = await Promise.all(messages.map(async (msg) => {
        const reactions = await storage.getMessageReactions(msg.id, 'direct');
        return { ...msg, reactions };
      }));
      
      res.json(messagesWithReactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Mark messages from a user as read
  app.post("/api/messages/:userId/mark-read", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const otherUserId = req.params.userId;
      await storage.markMessagesFromUserAsRead(currentUser.id, otherUserId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Delete direct message (only own messages)
  app.delete("/api/messages/:messageId", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const messageId = req.params.messageId;
      const message = await storage.getDirectMessage(messageId);
      
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Only the sender can delete their own message
      if (message.senderId !== currentUser.id) {
        return res.status(403).json({ error: "You can only delete your own messages" });
      }

      await storage.deleteDirectMessage(messageId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  // ==================== MESSAGE REACTIONS API ====================

  // Get reactions for a message
  app.get("/api/messages/:messageId/reactions", async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;
      const messageType = (req.query.type as string) || 'direct';
      
      const reactions = await storage.getMessageReactions(messageId, messageType as 'direct' | 'group');
      res.json(reactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get reactions" });
    }
  });

  // Add or update reaction to a message
  app.post("/api/messages/:messageId/reactions", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { messageId } = req.params;
      const { emoji, messageType = 'direct' } = req.body;

      const supportedEmojis = ["😂", "❤", "👍", "😒", "😠"];
      if (!supportedEmojis.includes(emoji)) {
        return res.status(400).json({ error: "Invalid emoji" });
      }

      // Check if user already has a reaction
      const existingReaction = await storage.getMessageReaction(messageId, messageType, currentUser.id);
      
      if (existingReaction) {
        if (existingReaction.emoji === emoji) {
          // Remove reaction if same emoji clicked
          await storage.deleteMessageReaction(messageId, messageType, currentUser.id);
          res.json({ removed: true });
        } else {
          // Update to new emoji
          await storage.deleteMessageReaction(messageId, messageType, currentUser.id);
          const reaction = await storage.createMessageReaction({
            messageId,
            messageType,
            userId: currentUser.id,
            emoji,
            createdAt: new Date().toISOString(),
          });
          res.json({ ...reaction, user: currentUser });
        }
      } else {
        // Create new reaction
        const reaction = await storage.createMessageReaction({
          messageId,
          messageType,
          userId: currentUser.id,
          emoji,
          createdAt: new Date().toISOString(),
        });
        res.json({ ...reaction, user: currentUser });
      }
    } catch (error) {
      console.error("Error adding reaction:", error);
      res.status(500).json({ error: "Failed to add reaction" });
    }
  });

  // Remove reaction from a message
  app.delete("/api/messages/:messageId/reactions", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { messageId } = req.params;
      const messageType = (req.query.type as string) || 'direct';

      await storage.deleteMessageReaction(messageId, messageType as 'direct' | 'group', currentUser.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove reaction" });
    }
  });

  // ==================== MESSAGE READ RECEIPTS API ====================

  // Get read receipts for a message
  app.get("/api/messages/:messageId/read-receipts", async (req: Request, res: Response) => {
    try {
      const { messageId } = req.params;
      const messageType = (req.query.type as string) || 'direct';
      
      const receipts = await storage.getMessageReadReceipts(messageId, messageType as 'direct' | 'group');
      res.json(receipts);
    } catch (error) {
      res.status(500).json({ error: "Failed to get read receipts" });
    }
  });

  // Mark messages as read
  app.post("/api/messages/mark-read", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const { messageIds, messageType = 'direct' } = req.body;

      if (!messageIds || !Array.isArray(messageIds)) {
        return res.status(400).json({ error: "Message IDs required" });
      }

      await storage.markMessagesAsReadByUser(currentUser.id, messageIds, messageType);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking messages as read:", error);
      res.status(500).json({ error: "Failed to mark messages as read" });
    }
  });

  // Send direct message
  app.post("/api/messages", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { receiverId, content } = req.body;

      if (!receiverId || !content) {
        return res.status(400).json({ error: "Receiver ID and content required" });
      }

      // Check if users are connected
      const connection = await storage.getConnectionBetweenUsers(currentUser.id, receiverId);
      if (!connection || connection.status !== "accepted") {
        return res.status(403).json({ error: "You can only message users you are connected with" });
      }

      const message = await storage.createDirectMessage({
        senderId: currentUser.id,
        receiverId,
        content,
        timestamp: new Date().toISOString(),
        isRead: false,
      });

      // Notify via WebSocket if recipient is online
      const recipientWs = userConnections.get(receiverId);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        recipientWs.send(JSON.stringify({
          type: "direct_message",
          data: {
            ...message,
            sender: currentUser,
          },
        }));
      }

      res.json(message);
    } catch (error) {
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // OpenRouter AI support chat - NO authentication required
  app.post("/api/support/chat", async (req: Request, res: Response) => {
    try {
      const { message, language } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const openRouterApiKey = process.env.OPENROUTER_API_KEY;
      const openRouterModel = process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-exp:free";

      console.log("Support chat request received. API Key configured:", !!openRouterApiKey);

      if (!openRouterApiKey || openRouterApiKey.trim() === "") {
        console.log("OpenRouter API key not configured, using default response");
        return res.json({ 
          response: getDefaultSupportResponse(language || "en")
        });
      }

      const systemPrompt = `You are a helpful support assistant for LocalLinkChat, a professional networking platform. 

Company Information:
- LocalLinkChat connects local business professionals based on shared interests
- Users can discover connections, send connection requests, and message accepted connections
- The platform supports Networking, Marketing, Technology, E-commerce, Finance, Real Estate, Healthcare, and more

Your Role:
- Provide friendly, helpful responses about the platform
- Answer questions about features, usage, and troubleshooting
- Be concise and professional
- If you don't know something specific, offer to help find the answer

Language Instructions:
- Respond in the same language as the user's message
- Supported languages: English, Hungarian (Magyar), German (Deutsch)
- If the user writes in Hungarian, respond in Hungarian
- If the user writes in German, respond in German
- Default to English if unsure`;

      try {
        console.log("Calling OpenRouter API with model:", openRouterModel);
        
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterApiKey.trim()}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.SITE_URL || "http://localhost:5000",
            "X-Title": "LocalLinkChat Support"
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: message }
            ],
            max_tokens: 500,
            temperature: 0.7
          })
        });

        const responseText = await response.text();
        console.log("OpenRouter response status:", response.status);

        if (!response.ok) {
          console.error("OpenRouter API error response:", responseText);
          return res.json({ response: getDefaultSupportResponse(language || "en") });
        }

        const data = JSON.parse(responseText);
        const aiResponse = data.choices?.[0]?.message?.content;

        if (!aiResponse) {
          console.error("No AI response in data:", data);
          return res.json({ response: getDefaultSupportResponse(language || "en") });
        }

        console.log("AI response received successfully");
        res.json({ response: aiResponse });
      } catch (apiError: any) {
        console.error("OpenRouter API error:", apiError.message || apiError);
        res.json({ response: getDefaultSupportResponse(language || "en") });
      }
    } catch (error: any) {
      console.error("Support chat error:", error.message || error);
      res.status(500).json({ error: "Failed to process support request" });
    }
  });

  // ==================== POSTS API ====================

  // Serve post images statically
  app.use("/post_images", express.static(path.join(process.cwd(), "post_images")));

  // Get all posts with optional filters
  app.get("/api/posts", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      const sortBy = req.query.sortBy as 'newest' | 'likes' | undefined;
      const filterBy = req.query.filterBy as 'all' | 'connections' | undefined;
      
      let connectionIds: string[] | undefined;
      
      if (filterBy === 'connections' && currentUser) {
        const connections = await storage.getConnectionsByUser(currentUser.id);
        const acceptedConnections = connections.filter(c => c.status === "accepted");
        connectionIds = acceptedConnections.map(c => 
          c.requesterId === currentUser.id ? c.receiverId : c.requesterId
        );
        // Include own posts when filtering by connections
        connectionIds.push(currentUser.id);
      }
      
      const posts = await storage.getPosts({
        sortBy: sortBy || 'newest',
        connectionIds,
        currentUserId: currentUser?.id,
      });
      
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ error: "Failed to get posts" });
    }
  });

  // Get single post
  app.get("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      const post = await storage.getPost(req.params.id);
      
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      const user = await storage.getUser(post.userId);
      const likeCounts = await storage.getPostLikesCount(post.id);
      const comments = await storage.getPostComments(post.id);
      
      let userReaction: 'like' | 'dislike' | null = null;
      if (currentUser) {
        const reaction = await storage.getPostLike(post.id, currentUser.id);
        userReaction = reaction?.type as 'like' | 'dislike' | null;
      }
      
      res.json({
        ...post,
        user,
        likesCount: likeCounts.likes,
        dislikesCount: likeCounts.dislikes,
        commentsCount: comments.length,
        userReaction,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get post" });
    }
  });

  // Create new post
  app.post("/api/posts", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { content, imageUrl } = req.body;
      
      if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Content is required" });
      }
      
      const post = await storage.createPost({
        userId: currentUser.id,
        content: content.trim(),
        imageUrl: imageUrl || null,
        createdAt: new Date().toISOString(),
      });
      
      res.json({
        ...post,
        user: currentUser,
        likesCount: 0,
        dislikesCount: 0,
        commentsCount: 0,
        userReaction: null,
      });
    } catch (error) {
      console.error("Error creating post:", error);
      res.status(500).json({ error: "Failed to create post" });
    }
  });

  // Delete post (only own posts)
  app.delete("/api/posts/:id", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const post = await storage.getPost(req.params.id);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      if (post.userId !== currentUser.id) {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }
      
      await storage.deletePost(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // Like or dislike a post
  app.post("/api/posts/:id/react", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const postId = req.params.id;
      const { type } = req.body; // 'like' or 'dislike'
      
      if (!['like', 'dislike'].includes(type)) {
        return res.status(400).json({ error: "Invalid reaction type" });
      }
      
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      const existingReaction = await storage.getPostLike(postId, currentUser.id);
      
      if (existingReaction) {
        if (existingReaction.type === type) {
          // Remove the reaction if clicking same type
          await storage.deletePostLike(postId, currentUser.id);
        } else {
          // Update the reaction type
          await storage.updatePostLike(existingReaction.id, type);
        }
      } else {
        // Create new reaction
        await storage.createPostLike({
          postId,
          userId: currentUser.id,
          type,
          createdAt: new Date().toISOString(),
        });
      }
      
      const likeCounts = await storage.getPostLikesCount(postId);
      const newReaction = await storage.getPostLike(postId, currentUser.id);
      
      res.json({
        likesCount: likeCounts.likes,
        dislikesCount: likeCounts.dislikes,
        userReaction: newReaction?.type || null,
      });
    } catch (error) {
      console.error("Error reacting to post:", error);
      res.status(500).json({ error: "Failed to react to post" });
    }
  });

  // Get comments for a post
  app.get("/api/posts/:id/comments", async (req: Request, res: Response) => {
    try {
      const comments = await storage.getPostComments(req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to get comments" });
    }
  });

  // Add comment to a post
  app.post("/api/posts/:id/comments", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const postId = req.params.id;
      const { content } = req.body;
      
      if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Content is required" });
      }
      
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }
      
      const comment = await storage.createPostComment({
        postId,
        userId: currentUser.id,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      });
      
      res.json({
        ...comment,
        user: currentUser,
      });
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // Delete comment (only own comments)
  app.delete("/api/posts/:postId/comments/:commentId", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // Note: We'd need to get the comment to check ownership
      // For now, we'll allow deletion
      await storage.deletePostComment(req.params.commentId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete comment" });
    }
  });

  // ==================== SHORTS/REALS API ====================

  // Serve short videos statically
  app.use("/short_videos", express.static(path.join(process.cwd(), "short_videos")));

  // Get all shorts (with optional random selection)
  app.get("/api/shorts", async (req: Request, res: Response) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const random = req.query.random === "true";
      
      const shortsList = await storage.getShorts({ limit, random });
      res.json(shortsList);
    } catch (error) {
      console.error("Error fetching shorts:", error);
      res.status(500).json({ error: "Failed to get shorts" });
    }
  });

  // Get single short
  app.get("/api/shorts/:id", async (req: Request, res: Response) => {
    try {
      const short = await storage.getShort(req.params.id);
      
      if (!short) {
        return res.status(404).json({ error: "Short not found" });
      }
      
      const user = await storage.getUser(short.userId);
      res.json({ ...short, user });
    } catch (error) {
      res.status(500).json({ error: "Failed to get short" });
    }
  });

  // Create new short
  app.post("/api/shorts", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { title, description, videoUrl, thumbnailUrl, duration } = req.body;
      
      if (!videoUrl) {
        return res.status(400).json({ error: "Video URL is required" });
      }
      
      const short = await storage.createShort({
        userId: currentUser.id,
        title: title || null,
        description: description || null,
        videoUrl,
        thumbnailUrl: thumbnailUrl || null,
        duration: duration || null,
        viewCount: 0,
        createdAt: new Date().toISOString(),
      });
      
      res.json({
        ...short,
        user: currentUser,
      });
    } catch (error) {
      console.error("Error creating short:", error);
      res.status(500).json({ error: "Failed to create short" });
    }
  });

  // Delete short (only own shorts)
  app.delete("/api/shorts/:id", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const short = await storage.getShort(req.params.id);
      if (!short) {
        return res.status(404).json({ error: "Short not found" });
      }
      
      if (short.userId !== currentUser.id) {
        return res.status(403).json({ error: "Not authorized to delete this short" });
      }
      
      await storage.deleteShort(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete short" });
    }
  });

  // Increment view count
  app.post("/api/shorts/:id/view", async (req: Request, res: Response) => {
    try {
      await storage.incrementShortViewCount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update view count" });
    }
  });

  // React to short (like/dislike)
  app.post("/api/shorts/:id/react", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const shortId = req.params.id;
      const { type } = req.body; // 'like' or 'dislike'
      
      if (!['like', 'dislike'].includes(type)) {
        return res.status(400).json({ error: "Invalid reaction type" });
      }
      
      const short = await storage.getShort(shortId);
      if (!short) {
        return res.status(404).json({ error: "Short not found" });
      }
      
      const existingReaction = await storage.getShortLike(shortId, currentUser.id);
      
      if (existingReaction) {
        if (existingReaction.type === type) {
          // Remove the reaction if clicking same type
          await storage.deleteShortLike(shortId, currentUser.id);
        } else {
          // Update the reaction type
          await storage.updateShortLike(existingReaction.id, type);
        }
      } else {
        // Create new reaction
        await storage.createShortLike({
          shortId,
          userId: currentUser.id,
          type,
          createdAt: new Date().toISOString(),
        });
      }
      
      const likeCounts = await storage.getShortLikesCount(shortId);
      const newReaction = await storage.getShortLike(shortId, currentUser.id);
      
      res.json({
        likesCount: likeCounts.likes,
        dislikesCount: likeCounts.dislikes,
        userReaction: newReaction?.type || null,
      });
    } catch (error) {
      console.error("Error reacting to short:", error);
      res.status(500).json({ error: "Failed to react to short" });
    }
  });

  // Get comments for a short
  app.get("/api/shorts/:id/comments", async (req: Request, res: Response) => {
    try {
      const comments = await storage.getShortComments(req.params.id);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to get comments" });
    }
  });

  // Add comment to a short
  app.post("/api/shorts/:id/comments", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const shortId = req.params.id;
      const { content } = req.body;
      
      if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Content is required" });
      }
      
      const short = await storage.getShort(shortId);
      if (!short) {
        return res.status(404).json({ error: "Short not found" });
      }
      
      const comment = await storage.createShortComment({
        shortId,
        userId: currentUser.id,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      });
      
      res.json({
        ...comment,
        user: currentUser,
      });
    } catch (error) {
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Failed to create comment" });
    }
  });

  // Get short with enriched data (likes, comments count, user reaction)
  app.get("/api/shorts/:id/enriched", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      const short = await storage.getShort(req.params.id);
      
      if (!short) {
        return res.status(404).json({ error: "Short not found" });
      }
      
      const user = await storage.getUser(short.userId);
      const likeCounts = await storage.getShortLikesCount(short.id);
      const comments = await storage.getShortComments(short.id);
      
      let userReaction: string | null = null;
      if (currentUser) {
        const reaction = await storage.getShortLike(short.id, currentUser.id);
        userReaction = reaction?.type || null;
      }
      
      res.json({
        ...short,
        user,
        likesCount: likeCounts.likes,
        dislikesCount: likeCounts.dislikes,
        commentsCount: comments.length,
        userReaction,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get short" });
    }
  });

  // ==================== GROUPS API ====================

  // Get user's groups
  app.get("/api/groups", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const userGroups = await storage.getGroupsByUser(currentUser.id);
      res.json(userGroups);
    } catch (error) {
      res.status(500).json({ error: "Failed to get groups" });
    }
  });

  // Get group invitations for current user
  app.get("/api/groups/invitations", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const invitations = await storage.getGroupInvitations(currentUser.id);
      res.json(invitations);
    } catch (error) {
      res.status(500).json({ error: "Failed to get invitations" });
    }
  });

  // Create a new group
  app.post("/api/groups", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const { name, description, memberIds } = req.body;
      
      if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Group name is required" });
      }
      
      // Create the group
      const group = await storage.createGroup({
        name: name.trim(),
        description: description?.trim() || null,
        avatarUrl: null,
        createdById: currentUser.id,
        createdAt: new Date().toISOString(),
      });
      
      // Add creator as admin member (auto-accepted)
      await storage.createGroupMember({
        groupId: group.id,
        userId: currentUser.id,
        role: "admin",
        status: "accepted",
        invitedById: null,
        createdAt: new Date().toISOString(),
        joinedAt: new Date().toISOString(),
      });
      
      // Invite other members
      if (memberIds && Array.isArray(memberIds)) {
        for (const memberId of memberIds) {
          if (memberId !== currentUser.id) {
            // Create pending membership
            await storage.createGroupMember({
              groupId: group.id,
              userId: memberId,
              role: "member",
              status: "pending",
              invitedById: currentUser.id,
              createdAt: new Date().toISOString(),
              joinedAt: null,
            });
            
            // Create notification for the invited user
            await storage.createNotification({
              userId: memberId,
              type: "group_invitation",
              fromUserId: currentUser.id,
              connectionId: group.id, // Using connectionId to store groupId
              message: `${currentUser.fullName || currentUser.name} invited you to join "${group.name}"`,
              read: false,
              createdAt: new Date().toISOString(),
            });
            
            // Notify via WebSocket if user is online
            const recipientWs = userConnections.get(memberId);
            if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
              recipientWs.send(JSON.stringify({
                type: "notification",
                data: {
                  type: "group_invitation",
                  fromUser: currentUser,
                  groupId: group.id,
                  groupName: group.name,
                },
              }));
            }
          }
        }
      }
      
      res.json(group);
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  // Get group details
  app.get("/api/groups/:id", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const group = await storage.getGroup(req.params.id);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      // Check if user is a member
      const membership = await storage.getGroupMember(group.id, currentUser.id);
      if (!membership || membership.status !== "accepted") {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
      
      const members = await storage.getGroupMembers(group.id);
      const acceptedMembers = members.filter(m => m.status === "accepted");
      
      res.json({
        ...group,
        members: acceptedMembers,
        memberCount: acceptedMembers.length,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to get group" });
    }
  });

  // Accept group invitation
  app.post("/api/groups/:id/accept", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = req.params.id;
      const membership = await storage.getGroupMember(groupId, currentUser.id);
      
      if (!membership) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      
      if (membership.status !== "pending") {
        return res.status(400).json({ error: "Invitation already processed" });
      }
      
      await storage.updateGroupMemberStatus(membership.id, "accepted", new Date().toISOString());
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to accept invitation" });
    }
  });

  // Decline group invitation
  app.post("/api/groups/:id/decline", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = req.params.id;
      const membership = await storage.getGroupMember(groupId, currentUser.id);
      
      if (!membership) {
        return res.status(404).json({ error: "Invitation not found" });
      }
      
      if (membership.status !== "pending") {
        return res.status(400).json({ error: "Invitation already processed" });
      }
      
      await storage.updateGroupMemberStatus(membership.id, "declined");
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to decline invitation" });
    }
  });

  // Leave group
  app.post("/api/groups/:id/leave", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = req.params.id;
      const group = await storage.getGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      const membership = await storage.getGroupMember(groupId, currentUser.id);
      
      if (!membership || membership.status !== "accepted") {
        return res.status(400).json({ error: "You are not a member of this group" });
      }
      
      // Check if user is the only admin
      const members = await storage.getGroupMembers(groupId);
      const acceptedAdmins = members.filter(m => m.status === "accepted" && m.role === "admin");
      
      if (membership.role === "admin" && acceptedAdmins.length === 1) {
        // If last admin, check if there are other members to transfer to
        const acceptedMembers = members.filter(m => m.status === "accepted" && m.userId !== currentUser.id);
        
        if (acceptedMembers.length === 0) {
          // Delete the group if no other members
          await storage.deleteGroup(groupId);
          return res.json({ success: true, groupDeleted: true });
        } else {
          // Transfer admin role to another member
          const newAdmin = acceptedMembers[0];
          await storage.updateGroupMemberStatus(newAdmin.id, "accepted");
          // Update role manually (we'd need a separate method, but for now just remove the leaving user)
        }
      }
      
      await storage.deleteGroupMember(groupId, currentUser.id);
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to leave group" });
    }
  });

  // Get group messages
  app.get("/api/groups/:id/messages", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = req.params.id;
      
      // Check if user is a member
      const membership = await storage.getGroupMember(groupId, currentUser.id);
      if (!membership || membership.status !== "accepted") {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
      
      const messages = await storage.getGroupMessages(groupId);
      
      // Fetch reactions for each message
      const messagesWithReactions = await Promise.all(messages.map(async (msg) => {
        const reactions = await storage.getMessageReactions(msg.id, 'group');
        return { ...msg, reactions };
      }));
      
      res.json(messagesWithReactions);
    } catch (error) {
      res.status(500).json({ error: "Failed to get messages" });
    }
  });

  // Send group message
  app.post("/api/groups/:id/messages", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = req.params.id;
      const { content } = req.body;
      
      if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Content is required" });
      }
      
      // Check if user is a member
      const membership = await storage.getGroupMember(groupId, currentUser.id);
      if (!membership || membership.status !== "accepted") {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
      
      const message = await storage.createGroupMessage({
        groupId,
        senderId: currentUser.id,
        content: content.trim(),
        timestamp: new Date().toISOString(),
      });
      
      // Notify other group members via WebSocket
      const members = await storage.getGroupMembers(groupId);
      const acceptedMembers = members.filter(m => m.status === "accepted" && m.userId !== currentUser.id);
      
      for (const member of acceptedMembers) {
        const memberWs = userConnections.get(member.userId);
        if (memberWs && memberWs.readyState === WebSocket.OPEN) {
          memberWs.send(JSON.stringify({
            type: "group_message",
            data: {
              ...message,
              sender: currentUser,
              groupId,
            },
          }));
        }
      }
      
      res.json({
        ...message,
        sender: currentUser,
      });
    } catch (error) {
      console.error("Error sending group message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Invite users to group
  app.post("/api/groups/:id/invite", async (req: Request, res: Response) => {
    try {
      const currentUser = await getCurrentUser(req);
      if (!currentUser) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      const groupId = req.params.id;
      const { userIds } = req.body;
      
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ error: "User IDs are required" });
      }
      
      const group = await storage.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      // Check if current user is a member
      const membership = await storage.getGroupMember(groupId, currentUser.id);
      if (!membership || membership.status !== "accepted") {
        return res.status(403).json({ error: "You are not a member of this group" });
      }
      
      const invited: string[] = [];
      
      for (const userId of userIds) {
        // Check if user is already a member
        const existingMembership = await storage.getGroupMember(groupId, userId);
        if (existingMembership) {
          continue; // Skip if already invited/member
        }
        
        // Create pending membership
        await storage.createGroupMember({
          groupId,
          userId,
          role: "member",
          status: "pending",
          invitedById: currentUser.id,
          createdAt: new Date().toISOString(),
          joinedAt: null,
        });
        
        // Create notification
        await storage.createNotification({
          userId,
          type: "group_invitation",
          fromUserId: currentUser.id,
          connectionId: groupId,
          message: `${currentUser.fullName || currentUser.name} invited you to join "${group.name}"`,
          read: false,
          createdAt: new Date().toISOString(),
        });
        
        // Notify via WebSocket
        const recipientWs = userConnections.get(userId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({
            type: "notification",
            data: {
              type: "group_invitation",
              fromUser: currentUser,
              groupId: group.id,
              groupName: group.name,
            },
          }));
        }
        
        invited.push(userId);
      }
      
      res.json({ success: true, invited });
    } catch (error) {
      console.error("Error inviting users:", error);
      res.status(500).json({ error: "Failed to invite users" });
    }
  });

  return httpServer;
}

function getDefaultSupportResponse(language: string): string {
  const responses: Record<string, string> = {
    en: "Thank you for reaching out! Our support team will get back to you soon. In the meantime, you can explore the Discover page to find new connections or check out your profile settings.",
    hu: "Köszönjük, hogy felkerested! Támogatói csapatunk hamarosan válaszol. Addig is böngészheted a Felfedezés oldalt új kapcsolatokért, vagy nézd meg a profil beállításaidat.",
    de: "Vielen Dank für Ihre Nachricht! Unser Support-Team wird sich bald bei Ihnen melden. In der Zwischenzeit können Sie die Entdecken-Seite erkunden, um neue Verbindungen zu finden, oder Ihre Profileinstellungen überprüfen."
  };
  return responses[language] || responses.en;
}
