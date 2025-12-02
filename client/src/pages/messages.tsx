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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Send, ArrowLeft, MessageSquare, Users, ExternalLink, MoreVertical, UserX, ImagePlus, X, Trash2, Plus, LogOut, UserPlus, Smile, Check, CheckCheck, Image as ImageIcon } from "lucide-react";
import { Link } from "wouter";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import type { User, DirectMessage, Connection, Group, GroupMember, GroupMessage, MessageReaction, MessageReadReceipt } from "@shared/schema";

// Supported emoji reactions
const EMOJI_REACTIONS = ["😂", "❤", "👍", "😒", "😠"] as const;

// GIF Picker component using GIPHY
function GifPicker({ onSelect, t }: { onSelect: (gifUrl: string) => void; t: (key: string) => string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  // Fetch trending or search GIFs (using GIPHY's public beta key)
  const fetchGifs = async (query: string = "") => {
    setLoading(true);
    try {
      const apiKey = "dc6zaTOxFJmzC"; // GIPHY public beta key
      const endpoint = query 
        ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=20&rating=g`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=20&rating=g`;
      
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
        <Button variant="outline" size="icon" title={t("messages.sendGif")}>
          <span className="text-lg">GIF</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          placeholder={t("messages.searchGifs")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="mb-2"
        />
        <ScrollArea className="h-64">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : gifs.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">{t("messages.noGifsFound")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
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
                    className="w-full h-24 object-cover"
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

// Emoji reaction picker popup
function EmojiReactionPicker({ 
  messageId, 
  messageType,
  onReact,
  existingReaction,
}: { 
  messageId: string;
  messageType: 'direct' | 'group';
  onReact: (emoji: string) => void;
  existingReaction?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="p-1 rounded hover:bg-muted/50 transition-colors opacity-0 group-hover:opacity-100">
          <Smile className="w-4 h-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" side="top">
        <div className="flex gap-1">
          {EMOJI_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              className={`text-xl p-1.5 rounded hover:bg-muted transition-colors ${
                existingReaction === emoji ? 'bg-primary/20' : ''
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Message reactions display
function MessageReactionsDisplay({ reactions }: { reactions: Array<{ emoji: string; user: User }> }) {
  if (reactions.length === 0) return null;
  
  // Group reactions by emoji
  const grouped = reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r.user);
    return acc;
  }, {} as Record<string, User[]>);

  return (
    <div className="flex gap-1 mt-1">
      {Object.entries(grouped).map(([emoji, users]) => (
        <TooltipProvider key={emoji}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 bg-muted/50 rounded-full px-1.5 py-0.5 text-xs">
                {emoji}
                {users.length > 1 && <span className="text-muted-foreground">{users.length}</span>}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{users.map(u => u.fullName || u.name).join(", ")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}
    </div>
  );
}

// Read receipt indicator
function ReadReceiptIndicator({ 
  isRead, 
  readReceipts,
  isSender,
  t,
}: { 
  isRead: boolean;
  readReceipts: Array<{ user: User; readAt: string }>;
  isSender: boolean;
  t: (key: string) => string;
}) {
  if (!isSender) return null;
  
  if (readReceipts.length > 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 text-[10px] text-blue-500">
              <CheckCheck className="w-3 h-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className="space-y-1">
              <p className="font-medium text-xs">{t("messages.seenBy")}:</p>
              {readReceipts.map((r) => (
                <div key={r.user.id} className="flex items-center gap-2">
                  <Avatar className="w-4 h-4">
                    <AvatarImage src={r.user.avatarUrl || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {(r.user.fullName || r.user.name || "").charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{r.user.fullName || r.user.name}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  
  return (
    <span className={`inline-flex items-center text-[10px] ${isRead ? 'text-blue-500' : 'text-muted-foreground'}`}>
      {isRead ? <CheckCheck className="w-3 h-3" /> : <Check className="w-3 h-3" />}
    </span>
  );
}

interface ConversationWithUser {
  oderId: string;
  otherUser: User;
  lastMessage?: string;
  lastTimestamp?: string;
  unreadCount: number;
}

interface GroupWithDetails extends Group {
  memberCount: number;
}

interface GroupInvitation extends GroupMember {
  group: Group;
  invitedBy: User | null;
}

interface GroupMessageWithSender extends GroupMessage {
  sender: User;
}

interface MessagesPageProps {
  wsRef?: React.MutableRefObject<WebSocket | null>;
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

export default function MessagesPage({ wsRef }: MessagesPageProps) {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const openChat = useOpenChat();
  const [activeTab, setActiveTab] = useState<"direct" | "groups">("direct");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [leaveGroupDialogOpen, setLeaveGroupDialogOpen] = useState(false);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Get user's groups
  const { data: groups = [], isLoading: groupsLoading, refetch: refetchGroups } = useQuery<GroupWithDetails[]>({
    queryKey: ["/api/groups"],
  });

  // Get group invitations
  const { data: groupInvitations = [], refetch: refetchInvitations } = useQuery<GroupInvitation[]>({
    queryKey: ["/api/groups/invitations"],
  });

  // Get messages for selected group
  const { data: groupMessages = [], isLoading: groupMessagesLoading, refetch: refetchGroupMessages } = useQuery<GroupMessageWithSender[]>({
    queryKey: ["/api/groups", selectedGroupId, "messages"],
    queryFn: async () => {
      if (!selectedGroupId) return [];
      const res = await fetch(`/api/groups/${selectedGroupId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch group messages");
      return res.json();
    },
    enabled: !!selectedGroupId,
  });

  // Get selected group details
  const selectedGroup = selectedGroupId ? groups.find(g => g.id === selectedGroupId) : null;

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
      // Restore focus to input after sending
      setTimeout(() => messageInputRef.current?.focus(), 0);
    },
  });

  // Delete message mutation
  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/messages/${messageId}`);
    },
    onSuccess: () => {
      toast({ title: t("messages.messageDeleted") });
      setDeleteDialogOpen(false);
      setMessageToDelete(null);
      refetchMessages();
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
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

  // Send group message mutation
  const sendGroupMessageMutation = useMutation({
    mutationFn: async ({ content }: { content: string }) => {
      if (!selectedGroupId || !currentUser) return;
      return apiRequest("POST", `/api/groups/${selectedGroupId}/messages`, { content });
    },
    onSuccess: () => {
      setMessageInput("");
      refetchGroupMessages();
      setTimeout(() => messageInputRef.current?.focus(), 0);
    },
    onError: () => {
      toast({ title: t("errors.messageFailed"), variant: "destructive" });
    },
  });

  // Accept group invitation mutation
  const acceptInvitationMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest("POST", `/api/groups/${groupId}/accept`);
    },
    onSuccess: () => {
      toast({ title: t("groups.invitationAccepted") });
      refetchGroups();
      refetchInvitations();
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

  // Decline group invitation mutation
  const declineInvitationMutation = useMutation({
    mutationFn: async (groupId: string) => {
      return apiRequest("POST", `/api/groups/${groupId}/decline`);
    },
    onSuccess: () => {
      toast({ title: t("groups.invitationDeclined") });
      refetchInvitations();
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

  // Leave group mutation
  const leaveGroupMutation = useMutation({
    mutationFn: async () => {
      if (!selectedGroupId) return;
      return apiRequest("POST", `/api/groups/${selectedGroupId}/leave`);
    },
    onSuccess: () => {
      toast({ title: t("groups.leftGroup") });
      setSelectedGroupId(null);
      setLeaveGroupDialogOpen(false);
      refetchGroups();
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

  // Refetch group messages periodically when a group is selected
  useEffect(() => {
    if (!selectedGroupId) return;
    
    const interval = setInterval(() => {
      refetchGroupMessages();
    }, 3000);
    
    return () => clearInterval(interval);
  }, [selectedGroupId, refetchGroupMessages]);

  // Listen for typing events from WebSocket
  useEffect(() => {
    if (!wsRef?.current) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
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
        // Ignore parse errors
      }
    };

    const ws = wsRef.current;
    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [wsRef]);

  // Send typing indicator
  const handleTyping = (isTyping: boolean) => {
    if (!wsRef?.current || wsRef.current.readyState !== WebSocket.OPEN || !selectedUserId) return;
    
    wsRef.current.send(JSON.stringify({
      type: "typing",
      receiverId: selectedUserId,
      isTyping,
    }));
  };

  // Handle input change with typing indicator
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Send typing started
    if (e.target.value.length > 0) {
      handleTyping(true);
      // Auto-stop typing indicator after 2 seconds of no input
      typingTimeoutRef.current = setTimeout(() => {
        handleTyping(false);
      }, 2000);
    } else {
      handleTyping(false);
    }
  };

  const handleSendMessage = () => {
    if ((messageInput.trim() || selectedImage) && currentUser) {
      if (selectedGroupId) {
        // Sending to group
        sendGroupMessageMutation.mutate({ content: messageInput.trim() });
      } else {
        // Sending direct message
        sendMutation.mutate({ content: messageInput.trim(), imageData: selectedImage || undefined });
      }
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
    setSelectedGroupId(null);
  };

  const isLoading = connectionsLoading || conversationsLoading;
  const isGroupsLoading = groupsLoading;

  // Mobile: show either contacts list or chat
  // Desktop: show both side by side
  const showChat = (selectedUserId && selectedUser) || (selectedGroupId && selectedGroup);

  // Helper to render message content (with image and GIF support)
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
            className="max-w-[200px] rounded-lg mb-1"
          />
          {textContent && <p className="text-sm">{textContent}</p>}
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
            className="w-24 h-24 object-cover rounded-lg mb-1"
          />
          {textContent && <p className="text-sm">{textContent}</p>}
        </div>
      );
    }
    return <p className="text-sm">{content}</p>;
  };
  
  // Handle sending a GIF
  const handleSendGif = (gifUrl: string) => {
    if (selectedGroupId) {
      sendGroupMessageMutation.mutate({ content: `[GIF]${gifUrl}[/GIF]` });
    } else if (selectedUserId) {
      sendMutation.mutate({ content: `[GIF]${gifUrl}[/GIF]` });
    }
  };

  // React to a message
  const reactToMessageMutation = useMutation({
    mutationFn: async ({ messageId, emoji, messageType }: { messageId: string; emoji: string; messageType: 'direct' | 'group' }) => {
      return apiRequest("POST", `/api/messages/${messageId}/reactions`, { emoji, messageType });
    },
    onSuccess: () => {
      refetchMessages();
      if (selectedGroupId) refetchGroupMessages();
    },
  });

  return (
    <div className="h-[calc(100vh-10rem)] sm:h-[calc(100vh-12rem)]">
      {/* Header - hidden on mobile when chat is open */}
      <div className={`mb-4 sm:mb-6 ${showChat ? 'hidden lg:block' : ''}`}>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
          {t("messages.title")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t("messages.messageConnections")}
        </p>
      </div>

      <div className="flex h-full gap-4">
        {/* Sidebar with Tabs */}
        <Card className={`flex flex-col ${
          showChat 
            ? 'hidden lg:flex lg:w-80' 
            : 'w-full lg:w-80'
        }`}>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "direct" | "groups")} className="flex flex-col h-full">
            <TabsList className="grid w-full grid-cols-2  mb-0">
              <TabsTrigger value="direct" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">{t("messages.title")}</span>
              </TabsTrigger>
              <TabsTrigger value="groups" className="gap-2">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">{t("groups.title")}</span>
                {groupInvitations.length > 0 && (
                  <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                    {groupInvitations.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Direct Messages Tab */}
            <TabsContent value="direct" className="flex-1 flex flex-col m-0 mt-0">
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
                          onClick={() => {
                            setSelectedUserId(contact.id);
                            setSelectedGroupId(null);
                          }}
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
            </TabsContent>

            {/* Groups Tab */}
            <TabsContent value="groups" className="flex-1 flex flex-col m-0 mt-0">
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    {groups.length} {t("groups.title")}
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setCreateGroupDialogOpen(true)}
                    title={t("groups.createGroup")}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <ScrollArea className="flex-1">
                {/* Group Invitations */}
                {groupInvitations.length > 0 && (
                  <div className="p-2 border-b">
                    <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
                      {t("groups.pendingInvitations")}
                    </p>
                    <div className="space-y-1">
                      {groupInvitations.map((invitation) => (
                        <div
                          key={invitation.id}
                          className="p-3 rounded-lg bg-primary/5 border border-primary/20"
                        >
                          <div className="flex items-center gap-3 mb-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getInitials(invitation.group.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {invitation.group.name}
                              </p>
                              {invitation.invitedBy && (
                                <p className="text-xs text-muted-foreground">
                                  {invitation.invitedBy.fullName || invitation.invitedBy.name} {t("groups.groupInvitation")}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="default"
                              size="sm"
                              className="flex-1"
                              onClick={() => acceptInvitationMutation.mutate(invitation.groupId)}
                              disabled={acceptInvitationMutation.isPending}
                            >
                              {t("groups.acceptInvitation")}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => declineInvitationMutation.mutate(invitation.groupId)}
                              disabled={declineInvitationMutation.isPending}
                            >
                              {t("groups.declineInvitation")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Groups List */}
                {isGroupsLoading ? (
                  <div className="space-y-2 p-2">
                    <ConversationSkeleton />
                    <ConversationSkeleton />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="p-6 text-center">
                    <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("groups.noGroups")}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      {t("groups.noGroupsDescription")}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCreateGroupDialogOpen(true)}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {t("groups.createGroup")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1 p-2">
                    {groups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setSelectedUserId(null);
                        }}
                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                          selectedGroupId === group.id
                            ? "bg-primary/10"
                            : "hover:bg-muted"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary/10 text-primary">
                              {getInitials(group.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {group.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {group.memberCount === 1
                                ? t("groups.member")
                                : t("groups.members", { count: group.memberCount })}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
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
                
                {/* Direct Message Header */}
                {selectedUser && (
                  <>
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                      <AvatarImage src={selectedUser.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(selectedUser.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <Link href={`/profile/${selectedUser.id}`}>
                        <h3 className="font-semibold text-sm sm:text-base truncate hover:underline cursor-pointer">
                          {selectedUser.fullName || selectedUser.name}
                        </h3>
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {selectedUser.isOnline ? t("common.online") : t("common.offline")}
                      </p>
                    </div>
                  </>
                )}
                
                {/* Group Chat Header */}
                {selectedGroup && (
                  <>
                    <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(selectedGroup.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base truncate">
                        {selectedGroup.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {selectedGroup.memberCount === 1
                          ? t("groups.member")
                          : t("groups.members", { count: selectedGroup.memberCount })}
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Direct message actions */}
                {selectedUser && (
                  <>
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
                  </>
                )}
                
                {/* Group chat actions */}
                {selectedGroup && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setLeaveGroupDialogOpen(true)}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        {t("groups.leaveGroup")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Messages Area */}
            <ScrollArea className="flex-1 p-3 sm:p-4">
              {/* Direct Messages */}
              {selectedUser && (
                <>
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
                      <div className="flex flex-col">
                        <div
                          className={`group relative max-w-[80%] sm:max-w-xs px-3 sm:px-4 py-2 rounded-2xl ${
                            msg.senderId === currentUser?.id
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted rounded-bl-md"
                          }`}
                        >
                          {renderMessageContent(msg.content)}
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <p className="text-[10px] sm:text-xs opacity-70">
                              {formatDate(msg.timestamp)}
                            </p>
                            {/* Read receipt indicator for own messages */}
                            {msg.senderId === currentUser?.id && (
                              <ReadReceiptIndicator
                                isRead={msg.isRead || false}
                                readReceipts={[]}
                                isSender={true}
                                t={t}
                              />
                            )}
                          </div>
                          
                          {/* Action buttons (delete + reaction) */}
                          <div className={`absolute ${msg.senderId === currentUser?.id ? '-left-16' : '-right-16'} top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity`}>
                            {msg.senderId === currentUser?.id && (
                              <button
                                onClick={() => {
                                  setMessageToDelete(msg.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="p-1 hover:bg-destructive/10 rounded"
                                title={t("common.delete")}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </button>
                            )}
                            <EmojiReactionPicker
                              messageId={msg.id}
                              messageType="direct"
                              onReact={(emoji) => reactToMessageMutation.mutate({ messageId: msg.id, emoji, messageType: 'direct' })}
                            />
                          </div>
                        </div>
                        
                        {/* Reactions display */}
                        {(msg as any).reactions && (msg as any).reactions.length > 0 && (
                          <MessageReactionsDisplay reactions={(msg as any).reactions} />
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Typing indicator */}
                  {selectedUserId && typingUsers.has(selectedUserId) && (
                    <div className="flex justify-start">
                      <div className="bg-muted px-4 py-2 rounded-2xl rounded-bl-md">
                        <div className="flex gap-1 items-center">
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
                </>
              )}
              
              {/* Group Messages */}
              {selectedGroup && (
                <>
                  {groupMessagesLoading ? (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                          <Skeleton className="h-16 w-48 rounded-lg" />
                        </div>
                      ))}
                    </div>
                  ) : groupMessages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                      <Users className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/50 mb-3" />
                      <p className="text-sm sm:text-base text-muted-foreground">
                        {t("groups.startGroupMessage", { name: selectedGroup.name })}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 sm:space-y-4" data-testid="group-messages-list">
                      {groupMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.senderId === currentUser?.id ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div className="flex gap-2 max-w-[80%] sm:max-w-xs">
                            {msg.senderId !== currentUser?.id && (
                              <Link href={`/profile/${msg.sender.id}`}>
                                <Avatar className="w-8 h-8 flex-shrink-0">
                                  <AvatarImage src={msg.sender.avatarUrl || undefined} />
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {getInitials(msg.sender.fullName || msg.sender.name || "")}
                                  </AvatarFallback>
                                </Avatar>
                              </Link>
                            )}
                            <div className="flex flex-col">
                              <div
                                className={`group relative px-3 sm:px-4 py-2 rounded-2xl ${
                                  msg.senderId === currentUser?.id
                                    ? "bg-primary text-primary-foreground rounded-br-md"
                                    : "bg-muted rounded-bl-md"
                                }`}
                              >
                                {msg.senderId !== currentUser?.id && (
                                  <p className="text-xs font-medium mb-1 opacity-80">
                                    {msg.sender.fullName || msg.sender.name}
                                  </p>
                                )}
                                {renderMessageContent(msg.content)}
                                <p className="text-[10px] sm:text-xs opacity-70 mt-1">
                                  {formatDate(msg.timestamp)}
                                </p>
                                
                                {/* Reaction picker for group messages */}
                                <div className={`absolute ${msg.senderId === currentUser?.id ? '-left-10' : '-right-10'} top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                  <EmojiReactionPicker
                                    messageId={msg.id}
                                    messageType="group"
                                    onReact={(emoji) => reactToMessageMutation.mutate({ messageId: msg.id, emoji, messageType: 'group' })}
                                  />
                                </div>
                              </div>
                              
                              {/* Reactions display */}
                              {(msg as any).reactions && (msg as any).reactions.length > 0 && (
                                <MessageReactionsDisplay reactions={(msg as any).reactions} />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </>
              )}
            </ScrollArea>

            {/* Image Preview - only for direct messages */}
            {selectedUser && selectedImage && (
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
              {/* Image upload */}
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
                disabled={sendMutation.isPending || sendGroupMessageMutation.isPending}
                title={t("messages.attachImage")}
              >
                <ImagePlus className="w-4 h-4" />
              </Button>
              
              {/* GIF button */}
              <GifPicker onSelect={handleSendGif} t={t} />
              
              <Input
                ref={messageInputRef}
                placeholder={selectedGroup ? t("groups.typeGroupMessage") : t("messages.typeMessage")}
                value={messageInput}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!selectedGroupId) handleTyping(false);
                    handleSendMessage();
                  }
                }}
                onBlur={() => !selectedGroupId && handleTyping(false)}
                disabled={sendMutation.isPending || sendGroupMessageMutation.isPending}
                className="flex-1 text-base"
                data-testid="input-message"
              />
              <Button
                onClick={handleSendMessage}
                disabled={
                  (!messageInput.trim() && !selectedImage) || 
                  sendMutation.isPending || 
                  sendGroupMessageMutation.isPending
                }
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

      {/* Leave Group Confirmation Dialog */}
      <Dialog open={leaveGroupDialogOpen} onOpenChange={setLeaveGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("groups.leaveGroup")}</DialogTitle>
            <DialogDescription>
              {t("groups.leaveGroupConfirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveGroupDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => leaveGroupMutation.mutate()}
              disabled={leaveGroupMutation.isPending}
            >
              {t("groups.leaveGroup")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <CreateGroupDialog
        isOpen={createGroupDialogOpen}
        onClose={() => setCreateGroupDialogOpen(false)}
        connections={acceptedConnections}
        onGroupCreated={() => setActiveTab("groups")}
      />
    </div>
  );
}
