import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useOpenChat } from "@/components/chat-tray";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Send, ArrowLeft, MessageSquare, Users, ExternalLink, MoreVertical, UserX, ImagePlus, X } from "lucide-react";
import type { User, DirectMessage, Connection } from "@shared/schema";

interface ConversationWithUser {
  oderId: string;
  otherUser: User;
  lastMessage?: string;
  lastTimestamp?: string;
  unreadCount: number;
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

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return formatTime(timestamp);
  }
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString();
}

function ConversationSkeleton() {
  return (
    <div className="flex gap-3 p-3">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
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
        
        // Calculate scaling to cover 100x100 while maintaining aspect ratio
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

export default function MessagesPage() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const openChat = useOpenChat();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get accepted connections
  const { data: acceptedConnections = [], isLoading: connectionsLoading } = useQuery<
    (Connection & { otherUser: User })[]
  >({
    queryKey: ["/api/connections/accepted"],
  });

  // Get conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<ConversationWithUser[]>({
    queryKey: ["/api/messages/conversations"],
  });

  // Get messages for selected user
  const { data: messages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery<DirectMessage[]>({
    queryKey: ["messages", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const res = await fetch(`/api/messages/${selectedUserId}`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 403) {
          return [];
        }
        throw new Error("Failed to fetch messages");
      }
      return res.json();
    },
    enabled: !!selectedUserId,
  });

  // Mark messages as read and update unread count when selecting a conversation
  useEffect(() => {
    if (selectedUserId && messages.length > 0) {
      // Messages are marked as read on the server when fetched
      // Invalidate unread count to update sidebar badge
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    }
  }, [selectedUserId, messages.length]);

  const sendMutation = useMutation({
    mutationFn: async ({ content, imageData }: { content: string; imageData?: string }) => {
      if (!selectedUserId || !currentUser) return;
      const messageContent = imageData 
        ? `[IMAGE]${imageData}[/IMAGE]${content ? `\n${content}` : ""}`
        : content;
      return apiRequest("POST", "/api/messages", {
        receiverId: selectedUserId,
        content: messageContent,
      });
    },
    onSuccess: () => {
      setMessageInput("");
      setSelectedImage(null);
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    },
  });

  // Remove connection mutation
  const removeConnectionMutation = useMutation({
    mutationFn: async () => {
      const connection = acceptedConnections.find(
        c => c.otherUser.id === selectedUserId
      );
      if (!connection) throw new Error("Connection not found");
      return apiRequest("DELETE", `/api/connections/${connection.id}`);
    },
    onSuccess: () => {
      toast({ title: t("messages.connectionRemoved") });
      setSelectedUserId(null);
      setRemoveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/connections/accepted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Refetch messages periodically when a user is selected
  useEffect(() => {
    if (!selectedUserId) return;
    
    const interval = setInterval(() => {
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
    }, 3000);
    
    return () => clearInterval(interval);
  }, [selectedUserId, refetchMessages]);

  const handleSendMessage = () => {
    if ((messageInput.trim() || selectedImage) && currentUser) {
      sendMutation.mutate({ content: messageInput.trim(), imageData: selectedImage || undefined });
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      toast({ title: "Only PNG, JPG, and JPEG images are allowed", variant: "destructive" });
      return;
    }

    try {
      const resizedImage = await resizeImage(file);
      setSelectedImage(resizedImage);
    } catch (error) {
      toast({ title: t("errors.uploadFailed"), variant: "destructive" });
    }
  };

  const removeSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const selectedUser = selectedUserId 
    ? (acceptedConnections.find(c => c.otherUser.id === selectedUserId)?.otherUser ||
       conversations.find(c => c.otherUser.id === selectedUserId)?.otherUser)
    : null;

  // Combine connected users and users with existing conversations
  const allContacts = [...acceptedConnections.map(c => c.otherUser)];
  conversations.forEach(conv => {
    if (!allContacts.find(u => u.id === conv.otherUser.id)) {
      allContacts.push(conv.otherUser);
    }
  });

  const handleOpenInTray = (user: User) => {
    openChat(user);
  };

  const handleBack = () => {
    setSelectedUserId(null);
  };

  const isLoading = connectionsLoading || conversationsLoading;

  // Mobile: show either contacts list or chat
  // Desktop: show both side by side
  const showChat = selectedUserId && selectedUser;

  // Helper to render message content (with image support)
  const renderMessageContent = (content: string) => {
    const imageMatch = content.match(/\[IMAGE\](.*?)\[\/IMAGE\]/);
    if (imageMatch) {
      const imageData = imageMatch[1];
      const textContent = content.replace(/\[IMAGE\].*?\[\/IMAGE\]/, "").trim();
      return (
        <div>
          <img 
            src={imageData} 
            alt={t("messages.imageSent")} 
            className="w-24 h-24 object-cover rounded-lg mb-1"
          />
          {textContent && <p className="text-sm">{textContent}</p>}
        </div>
      );
    }
    return <p className="text-sm">{content}</p>;
  };

  return (
    <div className="h-[calc(100vh-10rem)] sm:h-[calc(100vh-12rem)]">
      {/* Header - hidden on mobile when chat is open */}
      <div className={`mb-4 sm:mb-6 ${selectedUserId ? 'hidden lg:block' : ''}`}>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
          {t("messages.title")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t("messages.messageConnections")}
        </p>
      </div>

      <div className="flex h-full gap-4">
        {/* Conversations List - full width on mobile when no chat selected */}
        <Card className={`flex flex-col ${
          selectedUserId 
            ? 'hidden lg:flex lg:w-80' 
            : 'w-full lg:w-80'
        }`}>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-base font-semibold">
              {acceptedConnections.length} {t("dashboard.connections")}
            </CardTitle>
          </CardHeader>
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="space-y-2 p-2">
                <ConversationSkeleton />
                <ConversationSkeleton />
                <ConversationSkeleton />
              </div>
            ) : allContacts.length === 0 ? (
              <div className="p-6 text-center">
                <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("messages.noConversations")}
                </p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {allContacts.map((contact) => {
                  const conv = conversations.find(c => c.otherUser.id === contact.id);
                  return (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedUserId(contact.id)}
                      className={`w-full text-left p-3 rounded-lg transition-colors ${
                        selectedUserId === contact.id
                          ? "bg-primary/10"
                          : "hover:bg-muted"
                      }`}
                      data-testid={`conv-${contact.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={contact.avatarUrl || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(contact.name || "")}
                            </AvatarFallback>
                          </Avatar>
                          {contact.isOnline && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-background rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm truncate">
                              {contact.fullName || contact.name}
                            </p>
                            {conv?.lastTimestamp && (
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatDate(conv.lastTimestamp)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {conv?.lastMessage?.includes("[IMAGE]") 
                              ? t("messages.imageSent")
                              : (conv?.lastMessage || contact.jobPosition || t("messages.noMessages"))}
                          </p>
                        </div>
                        {conv && conv.unreadCount > 0 && (
                          <Badge variant="default" className="h-5 min-w-5 flex items-center justify-center text-xs flex-shrink-0">
                            {conv.unreadCount}
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </Card>

        {/* Messages View - full width on mobile */}
        {showChat ? (
          <Card className="flex-1 flex flex-col w-full lg:w-auto">
            {/* Chat Header */}
            <div className="p-3 sm:p-4 border-b flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  onClick={handleBack}
                  className="lg:hidden p-1 hover:bg-muted rounded"
                  data-testid="button-back"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                  <AvatarImage src={selectedUser.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {getInitials(selectedUser.name || "")}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base truncate">
                    {selectedUser.fullName || selectedUser.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedUser.isOnline ? t("common.online") : t("common.offline")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenInTray(selectedUser)}
                  className="hidden sm:flex"
                >
                  <ExternalLink className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Open in Tray</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setRemoveDialogOpen(true)}
                    >
                      <UserX className="w-4 h-4 mr-2" />
                      {t("messages.removeConnection")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-3 sm:p-4">
              {messagesLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                      <Skeleton className="h-16 w-48 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <MessageSquare className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/50 mb-3" />
                  <p className="text-sm sm:text-base text-muted-foreground">
                    {t("messages.startConversation", { name: selectedUser.name || "" })}
                  </p>
                </div>
              ) : (
                <div className="space-y-3 sm:space-y-4" data-testid="messages-list">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.senderId === currentUser?.id ? "justify-end" : "justify-start"
                      }`}
                      data-testid={`msg-${msg.id}`}
                    >
                      <div
                        className={`max-w-[80%] sm:max-w-xs px-3 sm:px-4 py-2 rounded-2xl ${
                          msg.senderId === currentUser?.id
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        }`}
                      >
                        {renderMessageContent(msg.content)}
                        <p className="text-[10px] sm:text-xs opacity-70 mt-1">
                          {formatDate(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Image Preview */}
            {selectedImage && (
              <div className="px-3 sm:px-4 pt-2">
                <div className="relative inline-block">
                  <img 
                    src={selectedImage} 
                    alt="Preview" 
                    className="w-20 h-20 object-cover rounded-lg border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={removeSelectedImage}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="p-3 sm:p-4 border-t flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/png,image/jpeg,image/jpg"
                className="hidden"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendMutation.isPending}
              >
                <ImagePlus className="w-4 h-4" />
              </Button>
              <Input
                placeholder={t("messages.typeMessage")}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={sendMutation.isPending}
                className="flex-1 text-base"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={(!messageInput.trim() && !selectedImage) || sendMutation.isPending}
                size="icon"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ) : (
          /* Empty state - hidden on mobile since contacts list is shown */
          <Card className="hidden lg:flex flex-1 items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {t("messages.selectConversation")}
              </p>
            </div>
          </Card>
        )}
      </div>

      {/* Remove Connection Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("messages.removeConnection")}</DialogTitle>
            <DialogDescription>
              {t("messages.removeConnectionConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeConnectionMutation.mutate()}
              disabled={removeConnectionMutation.isPending}
            >
              {t("messages.removeConnection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
