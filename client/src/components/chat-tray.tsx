import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { X, Minus, Send, ImagePlus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { User, DirectMessage } from "@shared/schema";

interface ChatWindow {
  id: string;
  user: User;
  isMinimized: boolean;
}

interface ChatTrayProps {
  wsRef: React.MutableRefObject<WebSocket | null>;
  onNewMessage?: (message: DirectMessage) => void;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Resize image to 100x100
async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 100;
        canvas.height = 100;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        
        const scale = Math.max(100 / img.width, 100 / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (100 - scaledWidth) / 2;
        const offsetY = (100 - scaledHeight) / 2;
        
        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function ChatTray({ wsRef, onNewMessage }: ChatTrayProps) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [openChats, setOpenChats] = useState<ChatWindow[]>([]);
  const [chatMessages, setChatMessages] = useState<Record<string, DirectMessage[]>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const messagesEndRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Listen for incoming messages
  useEffect(() => {
    if (!wsRef.current) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "direct_message") {
          const message = data.data as DirectMessage;
          const otherUserId = message.senderId === currentUser?.id 
            ? message.receiverId 
            : message.senderId;

          setChatMessages((prev) => ({
            ...prev,
            [otherUserId]: [...(prev[otherUserId] || []), message],
          }));

          // Check if this user's chat is open (not minimized) in the tray
          const existingChat = openChats.find((c) => c.user.id === message.senderId);
          const isChatOpenAndVisible = existingChat && !existingChat.isMinimized;

          // Open chat if not open and message is from someone else
          if (message.senderId !== currentUser?.id) {
            if (!existingChat && data.sender) {
              openChat(data.sender);
            }
          }

          // Sync with messages page
          queryClient.invalidateQueries({ queryKey: ["messages", otherUserId] });
          queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
          
          // Only update unread count if chat is NOT open/visible in tray
          // If chat is open, the message is considered "read"
          if (!isChatOpenAndVisible) {
            queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
            onNewMessage?.(message);
          } else {
            // Mark the message as read since chat is open
            fetch(`/api/messages/${otherUserId}/mark-read`, { 
              method: "POST", 
              credentials: "include" 
            }).catch(() => {});
          }
        }

        if (data.type === "direct_message_sent") {
          const message = data.data as DirectMessage;
          setChatMessages((prev) => ({
            ...prev,
            [message.receiverId]: [...(prev[message.receiverId] || []), message],
          }));

          // Sync with messages page
          queryClient.invalidateQueries({ queryKey: ["messages", message.receiverId] });
          queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
        }

        if (data.type === "typing") {
          if (data.isTyping) {
            setTypingUsers((prev) => new Set([...Array.from(prev), data.userId]));
          } else {
            setTypingUsers((prev) => {
              const newSet = new Set(prev);
              newSet.delete(data.userId);
              return newSet;
            });
          }
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    const ws = wsRef.current;
    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [wsRef, currentUser?.id, openChats, onNewMessage]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    openChats.forEach((chat) => {
      if (!chat.isMinimized) {
        messagesEndRefs.current[chat.id]?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }, [chatMessages, openChats]);

  const openChat = useCallback((user: User) => {
    setOpenChats((prev) => {
      const existing = prev.find((c) => c.user.id === user.id);
      if (existing) {
        return prev.map((c) =>
          c.user.id === user.id ? { ...c, isMinimized: false } : c
        );
      }
      const newChats = [{ id: user.id, user, isMinimized: false }, ...prev.slice(0, 2)];
      return newChats;
    });

    loadMessages(user.id);
  }, []);

  const loadMessages = async (userId: string) => {
    try {
      const res = await fetch(`/api/messages/${userId}`, { credentials: "include" });
      if (res.ok) {
        const messages = await res.json();
        setChatMessages((prev) => ({ ...prev, [userId]: messages }));
        // Messages are marked as read on the server, update unread count
        queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
        queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  };

  const closeChat = (userId: string) => {
    setOpenChats((prev) => prev.filter((c) => c.user.id !== userId));
    // Clear selected image for this chat
    setSelectedImages((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  };

  const toggleMinimize = (userId: string) => {
    setOpenChats((prev) =>
      prev.map((c) =>
        c.user.id === userId ? { ...c, isMinimized: !c.isMinimized } : c
      )
    );
  };

  const sendMessage = async (userId: string) => {
    const content = inputValues[userId]?.trim() || "";
    const imageData = selectedImages[userId];
    
    if (!content && !imageData) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const messageContent = imageData 
      ? `[IMAGE]${imageData}[/IMAGE]${content ? `\n${content}` : ""}`
      : content;

    wsRef.current.send(JSON.stringify({
      type: "direct_message",
      receiverId: userId,
      content: messageContent,
    }));

    setInputValues((prev) => ({ ...prev, [userId]: "" }));
    setSelectedImages((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["messages", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    }, 500);
  };

  const handleTyping = (userId: string, isTyping: boolean) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: "typing",
      receiverId: userId,
      isTyping,
    }));
  };

  const handleImageSelect = async (userId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Only PNG, JPG, and JPEG images are allowed", variant: "destructive" });
      return;
    }

    try {
      const resizedImage = await resizeImage(file);
      setSelectedImages((prev) => ({ ...prev, [userId]: resizedImage }));
    } catch (error) {
      toast({ title: "Failed to process image", variant: "destructive" });
    }
  };

  const removeSelectedImage = (userId: string) => {
    setSelectedImages((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    if (fileInputRefs.current[userId]) {
      fileInputRefs.current[userId]!.value = "";
    }
  };

  // Render message content with image support
  const renderMessageContent = (content: string) => {
    const imageMatch = content.match(/\[IMAGE\](.*?)\[\/IMAGE\]/);
    if (imageMatch) {
      const imageData = imageMatch[1];
      const textContent = content.replace(/\[IMAGE\].*?\[\/IMAGE\]/, "").trim();
      return (
        <div>
          <img 
            src={imageData} 
            alt="Image" 
            className="w-20 h-20 object-cover rounded-lg mb-1"
          />
          {textContent && <p className="text-xs sm:text-sm">{textContent}</p>}
        </div>
      );
    }
    return <p className="text-xs sm:text-sm">{content}</p>;
  };

  // Expose openChat method globally for other components
  useEffect(() => {
    (window as any).openChatWith = openChat;
    return () => {
      delete (window as any).openChatWith;
    };
  }, [openChat]);

  const maximizedChats = openChats.filter((c) => !c.isMinimized);
  const minimizedChats = openChats.filter((c) => c.isMinimized);

  return (
    <div className="fixed bottom-0 right-24 z-40 flex items-end gap-2">
      {/* Minimized chat heads */}
      <div className="flex gap-2 mb-2">
        <AnimatePresence>
          {minimizedChats.map((chat) => (
            <motion.div
              key={chat.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="relative"
            >
              <button
                onClick={() => toggleMinimize(chat.user.id)}
                className="relative group"
              >
                <Avatar className="w-12 h-12 border-2 border-background shadow-lg hover:scale-110 transition cursor-pointer">
                  <AvatarImage src={chat.user.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials(chat.user.name || "")}
                  </AvatarFallback>
                </Avatar>
                {chat.user.isOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeChat(chat.user.id);
                  }}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </button>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs font-medium text-foreground whitespace-nowrap">
                {chat.user.name?.split(" ")[0]}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Open chat windows */}
      <div className="flex gap-2">
        <AnimatePresence>
          {maximizedChats.map((chat) => (
            <motion.div
              key={chat.id}
              initial={{ y: 300, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 300, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <Card className="w-72 sm:w-80 h-80 sm:h-96 flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border-b bg-card">
                  <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
                    <AvatarImage src={chat.user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs sm:text-sm">
                      {getInitials(chat.user.name || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs sm:text-sm truncate">{chat.user.name}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      {chat.user.isOnline ? t("common.online") : t("common.offline")}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => toggleMinimize(chat.user.id)}
                    >
                      <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 sm:h-7 sm:w-7"
                      onClick={() => closeChat(chat.user.id)}
                    >
                      <X className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-2 sm:p-3">
                  <div className="space-y-2 sm:space-y-3">
                    {(chatMessages[chat.user.id] || []).map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.senderId === currentUser?.id ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl ${
                            msg.senderId === currentUser?.id
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {renderMessageContent(msg.content)}
                          <p className="text-[9px] sm:text-[10px] opacity-70 mt-0.5">
                            {formatTime(msg.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {typingUsers.has(chat.user.id) && (
                      <div className="flex justify-start">
                        <div className="bg-muted px-3 py-2 rounded-2xl rounded-bl-md">
                          <div className="flex gap-1">
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={(el) => (messagesEndRefs.current[chat.id] = el)} />
                  </div>
                </ScrollArea>

                {/* Image Preview */}
                {selectedImages[chat.user.id] && (
                  <div className="px-2 sm:px-3 pt-1">
                    <div className="relative inline-block">
                      <img 
                        src={selectedImages[chat.user.id]} 
                        alt="Preview" 
                        className="w-16 h-16 object-cover rounded-lg border"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-1 -right-1 h-5 w-5"
                        onClick={() => removeSelectedImage(chat.user.id)}
                      >
                        <X className="w-2 h-2" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Input */}
                <div className="p-2 sm:p-3 border-t">
                  <input
                    type="file"
                    ref={(el) => (fileInputRefs.current[chat.user.id] = el)}
                    onChange={(e) => handleImageSelect(chat.user.id, e)}
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                  />
                  <div className="flex gap-1 sm:gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0"
                      onClick={() => fileInputRefs.current[chat.user.id]?.click()}
                    >
                      <ImagePlus className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                    <Input
                      value={inputValues[chat.user.id] || ""}
                      onChange={(e) => {
                        setInputValues((prev) => ({ ...prev, [chat.user.id]: e.target.value }));
                        handleTyping(chat.user.id, e.target.value.length > 0);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(chat.user.id);
                        }
                      }}
                      onBlur={() => handleTyping(chat.user.id, false)}
                      placeholder={t("messages.typeMessage")}
                      className="flex-1 h-8 sm:h-9 text-sm"
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8 sm:h-9 sm:w-9"
                      onClick={() => sendMessage(chat.user.id)}
                      disabled={!inputValues[chat.user.id]?.trim() && !selectedImages[chat.user.id]}
                    >
                      <Send className="w-3 h-3 sm:w-4 sm:h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Export a hook to open chats from other components
export function useOpenChat() {
  return useCallback((user: User) => {
    const openChatFn = (window as any).openChatWith;
    if (openChatFn) {
      openChatFn(user);
    }
  }, []);
}
