import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Clock,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { User, Short, ShortComment } from "@shared/schema";

interface EnrichedShort extends Short {
  user: User;
  likesCount?: number;
  dislikesCount?: number;
  commentsCount?: number;
  userReaction?: 'like' | 'dislike' | null;
}

interface EnrichedComment extends ShortComment {
  user: User;
}

interface RealsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shorts: EnrichedShort[];
  initialIndex: number;
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

function CommentSkeleton() {
  return (
    <div className="flex gap-2 p-2">
      <Skeleton className="w-8 h-8 rounded-full" />
      <div className="flex-1 space-y-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

export function RealsModal({ isOpen, onClose, shorts, initialIndex }: RealsModalProps) {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const isTypingRef = useRef(false);
  
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [showComments, setShowComments] = useState(false);
  
  const currentShort = shorts[currentIndex];
  
  // Reset state when modal opens or index changes (but preserve input if user is typing)
  useEffect(() => {
    setCurrentIndex(initialIndex);
    // Only reset comment input if user is not actively typing
    if (!isTypingRef.current) {
      setCommentInput("");
    }
  }, [initialIndex, isOpen]);
  
  // Fetch comments
  const { data: comments = [], isLoading: commentsLoading, refetch: refetchComments } = useQuery<EnrichedComment[]>({
    queryKey: ["/api/shorts", currentShort?.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/shorts/${currentShort?.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: isOpen && !!currentShort?.id && showComments,
  });
  
  // Maintain focus on comment input - use a ref callback to ensure focus persists
  const inputRefCallback = useCallback((node: HTMLInputElement | null) => {
    if (node) {
      commentInputRef.current = node;
      // If user was typing, restore focus immediately
      if (isTypingRef.current && document.activeElement !== node) {
        // Use setTimeout to ensure this runs after React's render cycle
        setTimeout(() => {
          if (isTypingRef.current && node && document.activeElement !== node) {
            node.focus();
            const length = node.value.length;
            node.setSelectionRange(length, length);
          }
        }, 0);
      }
    }
  }, []);
  
  // Also restore focus when comments change (but not on every keystroke)
  useEffect(() => {
    if (showComments && isTypingRef.current && commentInputRef.current) {
      const input = commentInputRef.current;
      // Only restore if focus was lost
      if (document.activeElement !== input) {
        requestAnimationFrame(() => {
          if (input && isTypingRef.current && document.activeElement !== input) {
            input.focus();
            const length = input.value.length;
            input.setSelectionRange(length, length);
          }
        });
      }
    }
  }, [showComments, comments]);
  
  // Fetch enriched short data (likes, comments count, user reaction)
  const { data: enrichedData, refetch: refetchEnriched } = useQuery<{
    likesCount: number;
    dislikesCount: number;
    commentsCount: number;
    userReaction: 'like' | 'dislike' | null;
  }>({
    queryKey: ["/api/shorts", currentShort?.id, "enriched"],
    queryFn: async () => {
      const res = await fetch(`/api/shorts/${currentShort?.id}/enriched`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch short data");
      return res.json();
    },
    enabled: isOpen && !!currentShort?.id,
  });
  
  // Fetch comments
  const { data: comments = [], isLoading: commentsLoading, refetch: refetchComments } = useQuery<EnrichedComment[]>({
    queryKey: ["/api/shorts", currentShort?.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/shorts/${currentShort?.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: isOpen && !!currentShort?.id && showComments,
  });
  
  // React mutation
  const reactMutation = useMutation({
    mutationFn: async (type: 'like' | 'dislike') => {
      return apiRequest("POST", `/api/shorts/${currentShort?.id}/react`, { type });
    },
    onSuccess: () => {
      refetchEnriched();
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });
  
  // Comment mutation
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/shorts/${currentShort?.id}/comments`, { content });
    },
    onSuccess: () => {
      setCommentInput("");
      isTypingRef.current = false;
      refetchComments();
      refetchEnriched();
      toast({ title: t("reels.commentAdded") });
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });
  
  // Handle video play/pause
  const handlePlayToggle = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
        // Increment view count
        fetch(`/api/shorts/${currentShort?.id}/view`, { method: "POST", credentials: "include" });
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  // Handle mute toggle
  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };
  
  // Navigation
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(false);
      setShowComments(false);
    }
  };
  
  const goToNext = () => {
    if (currentIndex < shorts.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsPlaying(false);
      setShowComments(false);
    }
  };
  
  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      // Don't handle keyboard events if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key === "ArrowLeft") {
        goToPrevious();
      } else if (e.key === "ArrowRight") {
        goToNext();
      } else if (e.key === "Escape") {
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        handlePlayToggle();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentIndex, isPlaying]);
  
  // Handle comment submit
  const handleCommentSubmit = () => {
    if (commentInput.trim() && currentUser) {
      commentMutation.mutate(commentInput.trim());
    }
  };
  
  if (!currentShort) return null;
  
  const likesCount = enrichedData?.likesCount ?? 0;
  const dislikesCount = enrichedData?.dislikesCount ?? 0;
  const commentsCount = enrichedData?.commentsCount ?? 0;
  const userReaction = enrichedData?.userReaction ?? null;
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-full h-[90vh] p-0 gap-0 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full">
          {/* Video Section */}
          <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] md:min-h-0">
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-20 text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
            
            {/* Video */}
            <video
              ref={videoRef}
              src={currentShort.videoUrl}
              poster={currentShort.thumbnailUrl || undefined}
              className="max-h-full max-w-full object-contain"
              loop
              playsInline
              onEnded={() => setIsPlaying(false)}
              onClick={handlePlayToggle}
            />
            
            {/* Play/Pause overlay */}
            {!isPlaying && (
              <button
                onClick={handlePlayToggle}
                className="absolute inset-0 flex items-center justify-center bg-black/30"
              >
                <Play className="w-16 h-16 text-white drop-shadow-lg" />
              </button>
            )}
            
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
                {currentShort.viewCount || 0}
              </div>
            </div>
            
            {/* Left arrow */}
            {currentIndex > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                onClick={goToPrevious}
              >
                <ChevronLeft className="w-8 h-8" />
              </Button>
            )}
            
            {/* Right arrow */}
            {currentIndex < shorts.length - 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-12 w-12"
                onClick={goToNext}
              >
                <ChevronRight className="w-8 h-8" />
              </Button>
            )}
            
            {/* Index indicator */}
            <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
              {currentIndex + 1} / {shorts.length}
            </div>
          </div>
          
          {/* Info Section */}
          <div className="w-full md:w-80 flex flex-col border-l bg-background">
            {/* Creator info */}
            <div className="p-4 border-b">
              <Link href={`/profile/${currentShort.user.id}`} onClick={onClose}>
                <div className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={currentShort.user.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(currentShort.user.fullName || currentShort.user.name || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">
                      {currentShort.user.fullName || currentShort.user.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {currentShort.user.jobPosition || t("reels.creator")}
                    </p>
                  </div>
                </div>
              </Link>
              
              {currentShort.title && (
                <p className="mt-3 text-sm font-medium">{currentShort.title}</p>
              )}
              {currentShort.description && (
                <p className="mt-1 text-sm text-muted-foreground">{currentShort.description}</p>
              )}
              
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                {formatTimeAgo(currentShort.createdAt, t)}
              </div>
            </div>
            
            {/* Actions */}
            <div className="p-4 border-b flex items-center gap-2">
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
              
              <Button
                variant={showComments ? "secondary" : "outline"}
                size="sm"
                className="flex-1 gap-2"
                onClick={() => setShowComments(!showComments)}
              >
                <MessageCircle className="w-4 h-4" />
                {commentsCount}
              </Button>
            </div>
            
            {/* Comments Section */}
            {showComments && (
              <div className="flex-1 flex flex-col min-h-0">
                <ScrollArea className="flex-1">
                  <div className="p-2">
                    {commentsLoading ? (
                      <>
                        <CommentSkeleton />
                        <CommentSkeleton />
                        <CommentSkeleton />
                      </>
                    ) : comments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("reels.noComments")}
                      </p>
                    ) : (
                      comments.map((comment) => (
                        <div key={comment.id} className="flex gap-2 p-2">
                          <Link href={`/profile/${comment.user.id}`} onClick={onClose}>
                            <Avatar className="w-8 h-8 cursor-pointer hover:ring-2 hover:ring-primary/20">
                              <AvatarImage src={comment.user.avatarUrl || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {getInitials(comment.user.fullName || comment.user.name || "")}
                              </AvatarFallback>
                            </Avatar>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="bg-muted rounded-xl px-3 py-2">
                              <Link href={`/profile/${comment.user.id}`} onClick={onClose}>
                                <p className="font-medium text-xs hover:underline cursor-pointer">
                                  {comment.user.fullName || comment.user.name}
                                </p>
                              </Link>
                              <p className="text-sm">{comment.content}</p>
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-0.5 block">
                              {formatTimeAgo(comment.createdAt, t)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                
                {/* Comment input */}
                {currentUser && (
                  <div className="p-2 border-t flex gap-2" key={`comment-input-modal-${currentShort?.id}`}>
                    <Input
                      ref={inputRefCallback}
                      placeholder={t("reels.addComment")}
                      value={commentInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        isTypingRef.current = true;
                        setCommentInput(value);
                        // Ensure focus is maintained immediately after state update
                        requestAnimationFrame(() => {
                          if (commentInputRef.current && document.activeElement !== commentInputRef.current && isTypingRef.current) {
                            commentInputRef.current.focus();
                            const length = commentInputRef.current.value.length;
                            commentInputRef.current.setSelectionRange(length, length);
                          }
                        });
                      }}
                      onFocus={(e) => {
                        isTypingRef.current = true;
                        // Store the current selection
                        const input = e.currentTarget;
                        const selectionStart = input.selectionStart || 0;
                        const selectionEnd = input.selectionEnd || 0;
                        // Restore selection after a brief moment to ensure it's maintained
                        setTimeout(() => {
                          if (input === document.activeElement) {
                            input.setSelectionRange(selectionStart, selectionEnd);
                          }
                        }, 0);
                      }}
                      onBlur={(e) => {
                        // Only mark as not typing if focus moves outside the comments section
                        // This allows focus to move to the send button without losing typing state
                        const relatedTarget = e.relatedTarget as HTMLElement;
                        const container = e.currentTarget.closest('.flex.flex-col');
                        if (!relatedTarget || !container?.contains(relatedTarget)) {
                          // Small delay to allow focus to move to send button
                          setTimeout(() => {
                            if (document.activeElement !== commentInputRef.current && 
                                document.activeElement !== e.currentTarget.closest('.p-2')?.querySelector('button')) {
                              isTypingRef.current = false;
                            }
                          }, 100);
                        }
                      }}
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
                )}
              </div>
            )}
            
            {/* Placeholder when comments hidden */}
            {!showComments && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">{t("reels.clickToShowComments")}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

