import { useState, useEffect, useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { X, Minus, Send, ImagePlus, Check, CheckCheck, Smile, Trash2 } from "lucide-react";
import { ImageLightbox, useLightbox } from "@/components/image-lightbox";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { User, DirectMessage, MessageReaction } from "@shared/schema";

// Supported emoji reactions (same as messages.tsx)
const EMOJI_REACTIONS = ["😂", "❤️", "👍", "😒", "😠"] as const;

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

// Resize image to max 800px dimension while maintaining aspect ratio (for higher quality zoom)
async function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDimension = 800;
        let width = img.width;
        let height = img.height;
        
        // Only resize if larger than max dimension
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
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
  const { lightboxState, openLightbox, closeLightbox } = useLightbox();
  const [openChats, setOpenChats] = useState<ChatWindow[]>([]);
  const [chatMessages, setChatMessages] = useState<Record<string, DirectMessage[]>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [selectedImages, setSelectedImages] = useState<Record<string, string>>({});
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
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

  // Scroll to bottom when new messages arrive or typing indicator shows
  useEffect(() => {
    openChats.forEach((chat) => {
      if (!chat.isMinimized) {
        messagesEndRefs.current[chat.id]?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }, [chatMessages, openChats, typingUsers]);

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
        // Fetch reactions for each message
        const messagesWithReactions = await Promise.all(
          messages.map(async (msg: DirectMessage) => {
            try {
              const reactionsRes = await fetch(`/api/messages/${msg.id}/reactions`, { credentials: "include" });
              if (reactionsRes.ok) {
                const reactions = await reactionsRes.json();
                return { ...msg, reactions };
              }
            } catch (e) {
              console.error("Failed to fetch reactions for message:", msg.id, e);
            }
            return msg;
          })
        );
        setChatMessages((prev) => ({ ...prev, [userId]: messagesWithReactions }));
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
      loadMessages(userId);
    }, 500);
  };
  
  // Handle sending a GIF
  const handleSendGif = (userId: string, gifUrl: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    wsRef.current.send(JSON.stringify({
      type: "direct_message",
      receiverId: userId,
      content: `[GIF]${gifUrl}[/GIF]`,
    }));
    
    setTimeout(() => {
      loadMessages(userId);
    }, 100);
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

  // Render message content with image and GIF support
  const renderMessageContent = (content: string) => {
    // Check for GIF
    const gifMatch = content.match(/\[GIF\](.*?)\[\/GIF\]/);
    if (gifMatch) {
      const gifUrl = gifMatch[1];
      const textContent = content.replace(/\[GIF\].*?\[\/GIF\]/, "").trim();
      return (
        <div>
          <img 
            src={gifUrl} 
            alt={t("messages.gifSent")}
            className="max-w-[120px] max-h-[120px] object-cover rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(gifUrl, t("messages.gifSent"))}
          />
          {textContent && <p className="text-xs sm:text-sm">{textContent}</p>}
        </div>
      );
    }
    
    // Check for image
    const imageMatch = content.match(/\[IMAGE\](.*?)\[\/IMAGE\]/);
    if (imageMatch) {
      const imageData = imageMatch[1];
      const textContent = content.replace(/\[IMAGE\].*?\[\/IMAGE\]/, "").trim();
      return (
        <div>
          <img 
            src={imageData} 
            alt={t("messages.imageSent")}
            className="max-w-[120px] max-h-[120px] object-cover rounded-lg mb-1 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(imageData, t("messages.imageSent"))}
            title={t("messages.clickToZoom")}
          />
          {textContent && <p className="text-xs sm:text-sm">{textContent}</p>}
        </div>
      );
    }
    return <p className="text-xs sm:text-sm">{content}</p>;
  };
  
  // State for reaction popup
  const [reactionPopupMsgId, setReactionPopupMsgId] = useState<string | null>(null);
  
  // GIF Picker component (simplified for tray)
  function GifPickerTray({ onSelect, userId }: { onSelect: (gifUrl: string) => void; userId: string }) {
    const [searchQuery, setSearchQuery] = useState("");
    const [gifs, setGifs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    
    const fetchGifs = async (query: string = "") => {
      setLoading(true);
      try {
        const apiKey = "dc6zaTOxFJmzC";
        const endpoint = query 
          ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=12&rating=g`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=12&rating=g`;
        
        const res = await fetch(endpoint);
        const data = await res.json();
        setGifs(data.data || []);
      } catch (error) {
        console.error("Failed to fetch GIFs:", error);
        setGifs([]);
      }
      setLoading(false);
    };

    useEffect(() => {
      if (isOpen) {
        fetchGifs();
      }
    }, [isOpen]);

    useEffect(() => {
      const debounce = setTimeout(() => {
        if (isOpen && searchQuery) {
          fetchGifs(searchQuery);
        }
      }, 300);
      return () => clearTimeout(debounce);
    }, [searchQuery, isOpen]);

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0" title={t("messages.sendGif")}>
            <span className="text-xs sm:text-sm font-semibold">GIF</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <Input
            placeholder={t("messages.searchGifs")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mb-2 h-8 text-xs"
          />
          <ScrollArea className="h-48">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            ) : gifs.length === 0 ? (
              <p className="text-center text-muted-foreground py-4 text-xs">{t("messages.noGifsFound")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    onClick={() => {
                      onSelect(gif.images.fixed_height.url);
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                    className="rounded overflow-hidden hover:ring-2 hover:ring-primary transition-all"
                  >
                    <img
                      src={gif.images.fixed_height_small.url}
                      alt={gif.title}
                      className="w-full h-16 object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    );
  }
  
  // Handle sending a reaction
  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      await apiRequest("POST", `/api/messages/${messageId}/reactions`, { emoji, messageType: 'direct' });
      setReactionPopupMsgId(null);
      // Refresh messages to get updated reactions
      openChats.forEach(chat => {
        loadMessages(chat.user.id);
      });
    } catch (error) {
      console.error("Failed to add reaction:", error);
      toast({ title: t("errors.general"), variant: "destructive" });
    }
  };
  
  // Delete message mutation
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      toast({ title: t("messages.messageDeleted") });
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      // Refresh messages
      openChats.forEach(chat => {
        loadMessages(chat.user.id);
      });
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

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
              <Card className="w-80 sm:w-96 h-80 sm:h-96 flex flex-col shadow-2xl">
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
                        <div className="flex flex-col max-w-[85%]">
                          <div className="relative group">
                            <div
                              className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-2xl ${
                                msg.senderId === currentUser?.id
                                  ? "bg-primary text-primary-foreground rounded-br-md"
                                  : "bg-muted rounded-bl-md"
                              }`}
                            >
                              {renderMessageContent(msg.content)}
                              <div className="flex items-center justify-between gap-2 mt-0.5">
                                <p className="text-[9px] sm:text-[10px] opacity-70">
                                  {formatTime(msg.timestamp)}
                                </p>
                                {/* Read/unread status indicator for sent messages */}
                                {msg.senderId === currentUser?.id && (
                                  <span className={`inline-flex items-center justify-center rounded-full p-0.5 ${msg.isRead ? 'text-green-500 bg-black/90' : 'text-blue-500 bg-black/90'}`}>
                                    {msg.isRead ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            {/* Action buttons - delete and reaction */}
                            <div className={`absolute ${msg.senderId === currentUser?.id ? '-left-12' : '-right-12'} top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                              {msg.senderId === currentUser?.id && (
                                <button
                                  onClick={() => {
                                    setMessageToDelete(msg.id);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="p-0.5 hover:bg-destructive/10 rounded"
                                  title={t("common.delete")}
                                >
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </button>
                              )}
                              <Popover 
                                open={reactionPopupMsgId === msg.id} 
                                onOpenChange={(open) => setReactionPopupMsgId(open ? msg.id : null)}
                              >
                                <PopoverTrigger asChild>
                                  <button className="p-0.5 rounded hover:bg-muted/50 transition-colors">
                                    <Smile className="w-3 h-3 text-muted-foreground" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-1" side="top" align="center">
                                  <div className="flex gap-0.5">
                                    {EMOJI_REACTIONS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        onClick={() => handleReaction(msg.id, emoji)}
                                        className="text-base p-1 rounded hover:bg-muted transition-colors"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                          
                          {/* Reactions display */}
                          {(msg as any).reactions && Array.isArray((msg as any).reactions) && (msg as any).reactions.length > 0 && (
                            <div className="flex gap-0.5 mt-0.5">
                              {Object.entries(
                                ((msg as any).reactions as Array<{ emoji: string; user?: User }>).reduce((acc: Record<string, number>, r) => {
                                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                  return acc;
                                }, {})
                              ).map(([emoji, count]) => (
                                <span key={emoji} className="inline-flex items-center gap-0.5 bg-muted/50 rounded-full px-1 py-0.5 text-[10px]">
                                  {emoji}
                                  {(count as number) > 1 && <span className="text-muted-foreground">{count as number}</span>}
                                </span>
                              ))}
                            </div>
                          )}
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
                    <GifPickerTray 
                      onSelect={(gifUrl) => handleSendGif(chat.user.id, gifUrl)} 
                      userId={chat.user.id}
                    />
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

      {/* Image Lightbox for zooming images */}
      <ImageLightbox
        src={lightboxState.src}
        alt={lightboxState.alt}
        isOpen={lightboxState.isOpen}
        onClose={closeLightbox}
      />
      
      {/* Delete Message Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) setMessageToDelete(null);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("messages.deleteMessage")}</DialogTitle>
            <DialogDescription>
              {t("messages.deleteMessageConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => messageToDelete && deleteMessageMutation.mutate(messageToDelete)}
              disabled={deleteMessageMutation.isPending}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
