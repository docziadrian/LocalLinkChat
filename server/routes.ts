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
      
      res.json(messages);
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
