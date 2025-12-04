import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Video,
  Upload,
  Play,
  Pause,
  MoreHorizontal,
  Trash2,
  Eye,
  Clock,
  Plus,
  X,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Send,
  Volume2,
  VolumeX,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, ShortComment } from "@shared/schema";

interface Short {
  id: string;
  userId: string;
  title: string | null;
  description: string | null;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: number | null;
  viewCount: number;
  createdAt: string;
  user: User;
}

interface EnrichedComment extends ShortComment {
  user: User;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTimeAgo(timestamp: string, t: (key: string, vars?: Record<string, any>) => string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t("posts.justNow");
  if (diffMins < 60) return t("posts.minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("posts.hoursAgo", { count: diffHours });
  return t("posts.daysAgo", { count: diffDays });
}

// Page size for lazy loading
const PAGE_SIZE = 5;

// Animation variants for TikTok-like seamless transitions
// Faster, snappier transitions
const reelVariants = {
  enter: (direction: number) => ({
    y: direction > 0 ? "100%" : "-100%",
    zIndex: 1,
  }),
  center: {
    y: 0,
    zIndex: 1,
    transition: {
      duration: 0.18,
      ease: [0.25, 0.46, 0.45, 0.94], // Faster ease for snappy TikTok feel
    },
  },
  exit: (direction: number) => ({
    y: direction < 0 ? "25%" : "-25%",
    zIndex: 0,
    transition: {
      duration: 0.18,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  }),
};

// Single REAL item component with full-screen view
function ReelItem({ 
  short, 
  isActive, 
  currentUser, 
  t, 
  onDelete,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  currentIndex,
  totalCount,
  isLoadingMore,
  isMobile,
  onOpenCreateDialog,
}: { 
  short: Short;
  isActive: boolean;
  currentUser: User | null;
  t: (key: string, vars?: Record<string, any>) => string;
  onDelete: (id: string) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  currentIndex: number;
  totalCount: number;
  isLoadingMore?: boolean;
  isMobile?: boolean;
  onOpenCreateDialog?: () => void;
}) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false); // Sound ON by default
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false); // For mobile comments sheet
  
  const isOwnShort = currentUser?.id === short.userId;

  // Fetch enriched data (likes, dislikes, user reaction)
  const { data: enrichedData, refetch: refetchEnriched } = useQuery<{
    likesCount: number;
    dislikesCount: number;
    commentsCount: number;
    userReaction: 'like' | 'dislike' | null;
  }>({
    queryKey: ["/api/shorts", short.id, "enriched"],
    queryFn: async () => {
      const res = await fetch(`/api/shorts/${short.id}/enriched`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isActive,
  });

  // Fetch comments
  const { data: comments = [], isLoading: commentsLoading, refetch: refetchComments } = useQuery<EnrichedComment[]>({
    queryKey: ["/api/shorts", short.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/shorts/${short.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: isActive,
  });

  // React mutation
  const reactMutation = useMutation({
    mutationFn: async (type: 'like' | 'dislike') => {
      return apiRequest("POST", `/api/shorts/${short.id}/react`, { type });
    },
    onSuccess: () => {
      refetchEnriched();
    },
  });

  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/shorts/${short.id}/comments`, { content });
    },
    onSuccess: () => {
      setCommentInput("");
      refetchComments();
      refetchEnriched();
      toast({ title: t("reals.commentAdded") });
    },
  });

  // Auto-play when active
  useEffect(() => {
    if (isActive && videoRef.current) {
      videoRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // Autoplay might be blocked; keep isPlaying false
          setIsPlaying(!videoRef.current?.paused);
        });
      // Increment view count
      fetch(`/api/shorts/${short.id}/view`, { method: "POST", credentials: "include" });
    } else if (!isActive && videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  }, [isActive, short.id]);

  const handlePlayToggle = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleCommentSubmit = () => {
    if (commentInput.trim() && currentUser) {
      commentMutation.mutate(commentInput.trim());
    }
  };

  const likesCount = enrichedData?.likesCount ?? 0;
  const dislikesCount = enrichedData?.dislikesCount ?? 0;
  const userReaction = enrichedData?.userReaction ?? null;

  // Comments list component (shared between mobile and desktop)
  const CommentsContent = () => (
    <>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {commentsLoading ? (
            <>
              <div className="flex gap-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="w-8 h-8 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </div>
            </>
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("reals.noComments")}
            </p>
          ) : (
            comments.map((comment) => (
              <div key={comment.id} className="flex gap-2">
                <Link href={`/profile/${comment.user.id}`}>
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={comment.user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(comment.user.fullName || comment.user.name || "")}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="bg-muted rounded-xl px-3 py-2">
                    <Link href={`/profile/${comment.user.id}`}>
                      <p className="font-medium text-xs hover:underline">
                        {comment.user.fullName || comment.user.name}
                      </p>
                    </Link>
                    <p className="text-sm">{comment.content}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5 block px-1">
                    {formatTimeAgo(comment.createdAt, t)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      
      {/* Comment Input */}
      {currentUser ? (
        <div className="p-3 border-t flex gap-2">
          <Input
            placeholder={t("reals.addComment")}
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleCommentSubmit();
              }
            }}
            disabled={commentMutation.isPending}
            className="flex-1 text-sm"
          />
          <Button
            size="icon"
            onClick={handleCommentSubmit}
            disabled={!commentInput.trim() || commentMutation.isPending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div className="p-3 border-t text-center text-sm text-muted-foreground">
          {t("auth.signIn")} {t("reals.addComment").toLowerCase()}
        </div>
      )}
    </>
  );

  // Mobile Layout - Full-screen TikTok-style
  if (isMobile) {
    return (
      <div className="h-[90vh] w-full relative bg-black overflow-hidden">
        {/* Full-screen Video */}
        <video
          ref={videoRef}
          src={short.videoUrl}
          poster={short.thumbnailUrl || undefined}
          className="absolute inset-0 w-full h-full object-cover"
          loop
          playsInline
          muted={isMuted}
          autoPlay={isActive}
          onClick={handlePlayToggle}
        />
        
        {/* Gradient overlay for better text visibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" />
        
        {/* Play/Pause overlay */}
        {!isPlaying && (
          <button
            onClick={handlePlayToggle}
            className="absolute inset-0 flex items-center justify-center z-10"
          >
            <div className="w-20 h-20 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-10 h-10 text-white ml-1" />
            </div>
          </button>
        )}
        
        {/* Top bar - Index and menu */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between" data-no-swipe>
          <div className="bg-black/50 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm flex items-center gap-1.5">
            {currentIndex + 1} / {totalCount}
            {isLoadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          
          {isOwnShort && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 bg-black/50 hover:bg-black/70 text-white rounded-full">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        {/* Right side actions - TikTok style */}
        <div className="absolute right-3 bottom-32 z-20 flex flex-col items-center gap-5" data-no-swipe>
          {/* Like button */}
          <button
            onClick={() => currentUser && reactMutation.mutate('like')}
            disabled={!currentUser || reactMutation.isPending}
            className="flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              userReaction === 'like' ? 'bg-primary text-white' : 'bg-black/50 text-white hover:bg-black/70'
            }`}>
              <ThumbsUp className={`w-6 h-6 ${userReaction === 'like' ? 'fill-current' : ''}`} />
            </div>
            <span className="text-white text-xs font-medium drop-shadow-lg">{likesCount}</span>
          </button>
          
          {/* Dislike button */}
          <button
            onClick={() => currentUser && reactMutation.mutate('dislike')}
            disabled={!currentUser || reactMutation.isPending}
            className="flex flex-col items-center gap-1"
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
              userReaction === 'dislike' ? 'bg-destructive text-white' : 'bg-black/50 text-white hover:bg-black/70'
            }`}>
              <ThumbsDown className={`w-6 h-6 ${userReaction === 'dislike' ? 'fill-current' : ''}`} />
            </div>
            <span className="text-white text-xs font-medium drop-shadow-lg">{dislikesCount}</span>
          </button>
          
          {/* Comments button */}
          <button
            onClick={() => setCommentsOpen(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
              <MessageCircle className="w-6 h-6" />
            </div>
            <span className="text-white text-xs font-medium drop-shadow-lg">{comments.length}</span>
          </button>
          
          {/* Add REEL button - only on mobile, under comments */}
          {currentUser && onOpenCreateDialog && (
            <button
              onClick={onOpenCreateDialog}
              className="flex flex-col items-center gap-1"
            >
              <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors">
                <Plus className="w-6 h-6" />
              </div>
            </button>
          )}
          
          {/* Mute/Unmute */}
          <button
            onClick={handleMuteToggle}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors">
              {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </div>
          </button>
        </div>
        
        {/* Bottom left - Creator info */}
        <div className="absolute bottom-6 left-4 right-20 z-20 text-white">
          <Link href={`/profile/${short.user.id}`}>
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="w-11 h-11 border-2 border-white">
                <AvatarImage src={short.user.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {getInitials(short.user.fullName || short.user.name || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-sm drop-shadow-lg">
                  {short.user.fullName || short.user.name}
                </p>
                <p className="text-xs opacity-90 drop-shadow-lg">
                  {formatTimeAgo(short.createdAt, t)}
                </p>
              </div>
            </div>
          </Link>
          {short.title && (
            <p className="text-sm font-medium drop-shadow-lg line-clamp-2">
              {short.title}
            </p>
          )}
          {short.description && (
            <p className="text-xs opacity-90 drop-shadow-lg mt-1 line-clamp-2">
              {short.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs opacity-80">
            <Eye className="w-3.5 h-3.5" />
            <span>{short.viewCount || 0} views</span>
          </div>
        </div>
        
        {/* Mobile Comments Sheet */}
        <Sheet open={commentsOpen} onOpenChange={setCommentsOpen}>
          <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
            <SheetHeader className="pb-2 border-b">
              <SheetTitle className="text-center">
                {t("posts.comments")} ({comments.length})
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col h-[calc(70vh-4rem)]">
              <CommentsContent />
            </div>
          </SheetContent>
        </Sheet>
        
        {/* Delete Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("reals.deleteShort")}</DialogTitle>
              <DialogDescription>{t("reals.deleteConfirm")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onDelete(short.id);
                  setDeleteDialogOpen(false);
                }}
              >
                {t("common.delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Desktop Layout - Side-by-side video and comments
  return (
    <div className="h-full w-full flex flex-col lg:flex-row overflow-hidden">
      {/* Video Section */}
      <div className="relative flex-1 bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          src={short.videoUrl}
          poster={short.thumbnailUrl || undefined}
          className="max-h-full max-w-full object-contain"
          loop
          playsInline
          muted={isMuted}
          autoPlay={isActive}
          onClick={handlePlayToggle}
        />
        
        {/* Index indicator */}
        <div className="absolute top-4 left-4 z-20 bg-black/60 text-white text-sm font-medium px-3 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-2">
          {currentIndex + 1} / {totalCount}
          {isLoadingMore && <Loader2 className="w-3 h-3 animate-spin" />}
        </div>
        
        {/* Play/Pause overlay */}
        {!isPlaying && (
          <button
            onClick={handlePlayToggle}
            className="absolute inset-0 flex items-center justify-center bg-black/30"
          >
            <Play className="w-16 h-16 text-white drop-shadow-lg" />
          </button>
        )}
        
        {/* Navigation arrows */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={`h-12 w-12 rounded-full bg-black/30 text-white hover:bg-black/50 ${!hasPrev ? 'opacity-30 cursor-not-allowed' : ''}`}
            onClick={onPrev}
            disabled={!hasPrev}
          >
            <ChevronUp className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-12 w-12 rounded-full bg-black/30 text-white hover:bg-black/50 ${!hasNext ? 'opacity-30 cursor-not-allowed' : ''}`}
            onClick={onNext}
            disabled={!hasNext}
          >
            <ChevronDown className="w-6 h-6" />
          </Button>
        </div>
        
        {/* Controls */}
        <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={handleMuteToggle}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
          
          <div className="flex items-center gap-2 text-white text-sm">
            <Eye className="w-4 h-4" />
            {short.viewCount || 0}
          </div>
        </div>
        
        {/* Delete menu for own shorts */}
        {isOwnShort && (
          <div className="absolute top-4 right-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 bg-black/30 hover:bg-black/50 text-white">
                  <MoreHorizontal className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        
        {/* Creator info overlay */}
        <div className="absolute bottom-16 left-4 text-white">
          <Link href={`/profile/${short.user.id}`}>
            <div className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <Avatar className="w-10 h-10 border-2 border-white">
                <AvatarImage src={short.user.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {getInitials(short.user.fullName || short.user.name || "")}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-sm drop-shadow-md">
                  {short.user.fullName || short.user.name}
                </p>
                <p className="text-xs opacity-80 drop-shadow-md">
                  {formatTimeAgo(short.createdAt, t)}
                </p>
              </div>
            </div>
          </Link>
          {short.title && (
            <p className="mt-2 text-sm font-medium drop-shadow-md max-w-xs">
              {short.title}
            </p>
          )}
        </div>
      </div>
      
      {/* Comments Section - Desktop */}
      <div className="w-80 flex flex-col bg-background border-l h-full">
        {/* Actions */}
        <div className="p-3 border-b flex items-center gap-2">
          <Button
            variant={userReaction === 'like' ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => reactMutation.mutate('like')}
            disabled={!currentUser || reactMutation.isPending}
          >
            <ThumbsUp className={`w-4 h-4 ${userReaction === 'like' ? 'fill-current' : ''}`} />
            {likesCount}
          </Button>
          
          <Button
            variant={userReaction === 'dislike' ? "destructive" : "outline"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => reactMutation.mutate('dislike')}
            disabled={!currentUser || reactMutation.isPending}
          >
            <ThumbsDown className={`w-4 h-4 ${userReaction === 'dislike' ? 'fill-current' : ''}`} />
            {dislikesCount}
          </Button>
          
          <div className="flex items-center gap-1 text-muted-foreground px-2">
            <MessageCircle className="w-4 h-4" />
            <span className="text-sm">{comments.length}</span>
          </div>
        </div>
        
        <CommentsContent />
      </div>
      
      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reals.deleteShort")}</DialogTitle>
            <DialogDescription>{t("reals.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(short.id);
                setDeleteDialogOpen(false);
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Paginated response type
interface PaginatedShortsResponse {
  shorts: Short[];
  total: number;
  hasMore: boolean;
  offset: number;
  limit: number;
}

export default function RealsPage() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchString = useSearch();
  
  // Touch handling refs
  const touchStartY = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [initialIdSet, setInitialIdSet] = useState(false);
  const [direction, setDirection] = useState(0); // Track scroll direction for animation
  const [hasInteracted, setHasInteracted] = useState(false); // Only animate after user interaction

  // Fetch shorts with infinite query for lazy loading
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<PaginatedShortsResponse>({
    queryKey: ["/api/shorts", "paginated"],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await fetch(
        `/api/shorts?limit=${PAGE_SIZE}&offset=${pageParam}&paginated=true`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch shorts");
      return res.json();
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return lastPage.offset + lastPage.limit;
      }
      return undefined;
    },
    initialPageParam: 0,
  });

  // Flatten all pages into a single array of shorts
  const shorts = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.shorts);
  }, [data]);

  // Get total count from the first page
  const totalCount = data?.pages[0]?.total ?? shorts.length;

  // Set initial index from query param when shorts are loaded
  useEffect(() => {
    if (shorts.length > 0 && !initialIdSet) {
      const params = new URLSearchParams(searchString);
      const targetId = params.get('id');
      if (targetId) {
        const index = shorts.findIndex(s => s.id === targetId);
        if (index !== -1) {
          setCurrentIndex(index);
        }
      }
      setInitialIdSet(true);
    }
  }, [shorts, searchString, initialIdSet]);

  // Prefetch more shorts when approaching the end of loaded content
  useEffect(() => {
    const remainingItems = shorts.length - currentIndex - 1;
    const shouldPrefetch = remainingItems <= 2 && hasNextPage && !isFetchingNextPage;
    
    if (shouldPrefetch) {
      fetchNextPage();
    }
  }, [currentIndex, shorts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Create short mutation
  const createShortMutation = useMutation({
    mutationFn: async () => {
      if (!videoFile) throw new Error("No video file");
      
      setIsUploading(true);
      
      const formData = new FormData();
      formData.append("video", videoFile);
      
      console.log("Uploading video:", videoFile.name, "Size:", videoFile.size);
      
      // Create AbortController with long timeout for large video uploads (10 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes
      
      let uploadRes;
      try {
        uploadRes = await fetch("/api/upload/short-video", {
          method: "POST",
          credentials: "include",
          body: formData,
          signal: controller.signal,
          // Note: fetch doesn't support timeout directly, using AbortController instead
        });
        
        clearTimeout(timeoutId);
      } catch (fetchError: any) {
        // Handle network errors (CORS, connection issues, etc.)
        console.error("Network error during upload:", fetchError);
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          throw new Error("Upload timeout. A fájl feltöltése túl sokáig tartott. Próbáljon kisebb videót vagy ellenőrizze az internetkapcsolatát.");
        }
        
        if (fetchError.message && (fetchError.message.includes('NetworkError') || fetchError.message.includes('Failed to fetch'))) {
          throw new Error("Hálózati hiba. Ellenőrizze az internetkapcsolatát. Ha a fájl nagy, próbáljon kisebb videót vagy ellenőrizze a kapcsolat sebességét.");
        }
        throw new Error(fetchError.message || "A videó feltöltése sikertelen. Ellenőrizze a kapcsolatot és próbálja újra.");
      }
      
      if (!uploadRes.ok) {
        let errorMessage = "Failed to upload video";
        try {
          const errorData = await uploadRes.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
          console.error("Video upload failed:", uploadRes.status, errorData);
        } catch (e) {
          // If response is not JSON, use status text
          if (uploadRes.status === 413) {
            errorMessage = t("reals.videoTooLarge");
          } else {
            errorMessage = uploadRes.statusText || errorMessage;
          }
          console.error("Video upload failed:", uploadRes.status, uploadRes.statusText);
        }
        throw new Error(errorMessage);
      }
      
      const uploadData = await uploadRes.json();
      console.log("Video uploaded successfully:", uploadData);
      
      return apiRequest("POST", "/api/shorts", {
        title: title.trim() || null,
        description: description.trim() || null,
        videoUrl: uploadData.videoUrl,
        thumbnailUrl: null,
      });
    },
    onSuccess: () => {
      toast({ title: t("reals.shortCreated") });
      setCreateDialogOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/shorts", "paginated"] });
    },
    onError: (error: Error) => {
      console.error("Create short error:", error);
      toast({ 
        title: t("errors.uploadFailed"), 
        description: error.message,
        variant: "destructive" 
      });
    },
    onSettled: () => {
      setIsUploading(false);
    },
  });

  // Delete short mutation
  const deleteShortMutation = useMutation({
    mutationFn: async (shortId: string) => {
      return apiRequest("DELETE", `/api/shorts/${shortId}`);
    },
    onSuccess: () => {
      toast({ title: t("reals.shortDeleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/shorts", "paginated"] });
      // Adjust index if needed
      if (currentIndex >= shorts.length - 1) {
        setCurrentIndex(Math.max(0, shorts.length - 2));
      }
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setVideoFile(null);
    setVideoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
      if (!validTypes.includes(file.type)) {
        toast({ title: t("reals.invalidVideoType"), variant: "destructive" });
        return;
      }
      
      const maxSize = 2000000 * 1024 * 1024; // 200MB
      /*
      if (file.size > maxSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxSizeMB = (maxSize / (1024 * 1024)).toFixed(0);
        toast({ 
          title: t("reals.videoTooLarge"), 
          description: `Your file is ${fileSizeMB}MB. Maximum size is ${maxSizeMB}MB.`,
          variant: "destructive" 
        });
        return;
      }
        */
      
      setVideoFile(file);
      setVideoPreview(URL.createObjectURL(file));
    }
  };

  const removeVideo = () => {
    setVideoFile(null);
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setHasInteracted(true);
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    // Allow navigation if there are more loaded shorts OR if we can load more
    if (currentIndex < shorts.length - 1) {
      setHasInteracted(true);
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    } else if (hasNextPage && !isFetchingNextPage) {
      // Trigger load more and navigate when ready
      setHasInteracted(true);
      setDirection(1);
      fetchNextPage().then(() => {
        setCurrentIndex(currentIndex + 1);
      });
    }
  }, [currentIndex, shorts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle scroll/wheel navigation
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let lastScrollTime = 0;
    const scrollThrottle = 180; // Faster scroll navigation

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastScrollTime < scrollThrottle) return;
      lastScrollTime = now;

      if (e.deltaY > 0) {
        goToNext();
      } else if (e.deltaY < 0) {
        goToPrev();
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [goToPrev, goToNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goToPrev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  // Touch swipe handling for mobile
  useEffect(() => {
    if (!isMobile) return;
    
    const container = containerRef.current;
    if (!container) return;

    const minSwipeDistance = 50; // Minimum distance for a swipe
    let lastSwipeTime = 0;
    const swipeThrottle = 180; // Faster swipe navigation

    // Check if the touch target is an interactive element that should block swipe
    const isInteractiveElement = (target: EventTarget | null): boolean => {
      if (!target || !(target instanceof Element)) return false;
      
      // Check if target or any parent is an interactive element
      let element: Element | null = target;
      while (element) {
        // Check for buttons, links, inputs, and elements with data-no-swipe attribute
        if (
          element.tagName === 'BUTTON' ||
          element.tagName === 'A' ||
          element.tagName === 'INPUT' ||
          element.tagName === 'TEXTAREA' ||
          element.hasAttribute('data-no-swipe') ||
          element.closest('button') ||
          element.closest('[data-no-swipe]') ||
          element.closest('[role="button"]') ||
          // Also check for the right-side actions panel
          element.closest('.absolute.right-3')
        ) {
          return true;
        }
        element = element.parentElement;
      }
      return false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Don't start swipe if touching an interactive element
      if (isInteractiveElement(e.target)) {
        isSwiping.current = false;
        return;
      }
      
      touchStartY.current = e.touches[0].clientY;
      isSwiping.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping.current) return;
      touchEndY.current = e.touches[0].clientY;
      
      // Prevent default scroll behavior only when swiping
      e.preventDefault();
    };

    const handleTouchEnd = () => {
      if (!isSwiping.current) return;
      isSwiping.current = false;
      
      const now = Date.now();
      if (now - lastSwipeTime < swipeThrottle) return;
      
      const swipeDistance = touchStartY.current - touchEndY.current;
      
      if (Math.abs(swipeDistance) >= minSwipeDistance) {
        lastSwipeTime = now;
        if (swipeDistance > 0) {
          // Swiped up - go to next
          goToNext();
        } else {
          // Swiped down - go to previous
          goToPrev();
        }
      }
      
      // Reset
      touchStartY.current = 0;
      touchEndY.current = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isMobile, goToPrev, goToNext]);

  // Disable body scroll while the mobile Reels view is active
  useEffect(() => {
    if (!isMobile) return;

    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = "0";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.touchAction = originalTouchAction;
    };
  }, [isMobile]);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (shorts.length === 0) {
    return (
      <>
        {/* Create button - fixed top right, above everything (z-[100]) */}
        {currentUser && (
          <Dialog open={createDialogOpen} onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button 
                className="fixed top-4 right-4 z-[100] gap-2 shadow-xl bg-primary hover:bg-primary/90"
                size="default"
              >
                <Plus className="w-5 h-5" />
                <span>{t("reals.createShort")}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md z-[70]">
              <DialogHeader>
                <DialogTitle>{t("reals.createShort")}</DialogTitle>
                <DialogDescription>{t("reals.createDescription")}</DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                {!videoPreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm font-medium mb-1">{t("reals.uploadVideo")}</p>
                    <p className="text-xs text-muted-foreground">{t("reals.videoFormats")}</p>
                  </div>
                ) : (
                  <div className="relative rounded-lg overflow-hidden bg-black">
                    <video src={videoPreview} className="w-full aspect-[9/16] max-h-[300px] object-contain" controls />
                    <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={removeVideo}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="video/mp4,video/webm,video/quicktime,video/x-msvideo" className="hidden" />
                <Input placeholder={t("reals.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
                <Textarea placeholder={t("reals.descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>{t("common.cancel")}</Button>
                <Button onClick={() => createShortMutation.mutate()} disabled={!videoFile || isUploading}>
                  {isUploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("reals.uploading")}</>) : t("reals.publish")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
          <Card className="max-w-md w-full mx-4">
            <CardContent className="py-12 text-center">
              <Video className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg mb-2">{t("reals.noShorts")}</h3>
              <p className="text-muted-foreground mb-4">{t("reals.noShortsDescription")}</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const currentShort = shorts[currentIndex];

  return (
    <>
      {/* Create button - fixed position, only on desktop (mobile has it in the side actions) */}
      {currentUser && (
        <Dialog open={createDialogOpen} onOpenChange={(open) => {
          setCreateDialogOpen(open);
          if (!open) resetForm();
        }}>
          {!isMobile && (
            <DialogTrigger asChild>
              <Button 
                className="fixed z-[100] gap-2 shadow-xl bg-primary hover:bg-primary/90 -top-3 right-4"
                size="default"
              >
                <Plus className="w-5 h-5" />
                <span>{t("reals.createShort")}</span>
              </Button>
            </DialogTrigger>
          )}
          <DialogContent className="sm:max-w-md z-[70]">
            <DialogHeader>
              <DialogTitle>{t("reals.createShort")}</DialogTitle>
              <DialogDescription>{t("reals.createDescription")}</DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {!videoPreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                >
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium mb-1">{t("reals.uploadVideo")}</p>
                  <p className="text-xs text-muted-foreground">{t("reals.videoFormats")}</p>
                </div>
              ) : (
                <div className="relative rounded-lg overflow-hidden bg-black">
                  <video src={videoPreview} className="w-full aspect-[9/16] max-h-[300px] object-contain" controls />
                  <Button variant="destructive" size="icon" className="absolute top-2 right-2 h-8 w-8" onClick={removeVideo}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}
              
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="video/mp4,video/webm,video/quicktime,video/x-msvideo" className="hidden" />
              <Input placeholder={t("reals.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
              <Textarea placeholder={t("reals.descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} />
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={() => createShortMutation.mutate()} disabled={!videoFile || isUploading}>
                {isUploading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t("reals.uploading")}</>) : t("reals.publish")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <div 
        ref={containerRef}
        className={`overflow-hidden relative ${
          isMobile 
            ? 'h-[100dvh] fixed inset-0 z-40' 
            : 'h-[calc(100vh-8rem)]'
        }`}
      >
        {/* Animated REEL Container - no mode="wait" so both items visible during transition */}
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={currentShort.id}
            custom={direction}
            variants={hasInteracted ? reelVariants : undefined}
            initial={hasInteracted ? "enter" : false}
            animate="center"
            exit={hasInteracted ? "exit" : undefined}
            className="absolute inset-0"
          >
            <ReelItem
              short={currentShort}
              isActive={true}
              currentUser={currentUser}
              t={t}
              onDelete={(id) => deleteShortMutation.mutate(id)}
              onPrev={goToPrev}
              onNext={goToNext}
              hasPrev={currentIndex > 0}
              hasNext={currentIndex < shorts.length - 1 || hasNextPage}
              currentIndex={currentIndex}
              totalCount={totalCount}
              isLoadingMore={isFetchingNextPage}
              isMobile={isMobile}
              onOpenCreateDialog={isMobile ? () => setCreateDialogOpen(true) : undefined}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
