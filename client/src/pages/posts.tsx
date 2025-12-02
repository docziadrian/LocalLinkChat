import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  ImagePlus,
  X,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  MoreHorizontal,
  Trash2,
  Filter,
  SlidersHorizontal,
  Users,
  Clock,
  TrendingUp,
  Send,
  ChevronDown,
  ChevronUp,
  Share2,
  Check,
  Video,
  Play,
  ArrowRight,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import type { User, Post, PostComment, Connection, Short } from "@shared/schema";

interface EnrichedPost extends Post {
  user: User;
  likesCount: number;
  dislikesCount: number;
  commentsCount: number;
  userReaction?: "like" | "dislike" | null;
}

interface EnrichedComment extends PostComment {
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

function PostSkeleton() {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="flex gap-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

function CommentItem({ comment, t }: { comment: EnrichedComment; t: (key: string, vars?: Record<string, any>) => string }) {
  return (
    <div className="flex gap-3 py-3">
      <Link href={`/profile/${comment.user.id}`}>
        <Avatar className="w-8 h-8 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all">
          <AvatarImage src={comment.user.avatarUrl || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {getInitials(comment.user.fullName || comment.user.name || "")}
          </AvatarFallback>
        </Avatar>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-muted rounded-xl px-3 py-2">
          <Link href={`/profile/${comment.user.id}`}>
            <p className="font-medium text-sm hover:underline cursor-pointer">
              {comment.user.fullName || comment.user.name}
            </p>
          </Link>
          <p className="text-sm text-foreground/90">{comment.content}</p>
        </div>
        <span className="text-xs text-muted-foreground mt-1 block">
          {formatTimeAgo(comment.createdAt, t)}
        </span>
      </div>
    </div>
  );
}

function PostCard({ post, currentUser, t, connections, isHighlighted, postRef }: { 
  post: EnrichedPost; 
  currentUser: User | null; 
  t: (key: string, vars?: Record<string, any>) => string;
  connections: (Connection & { otherUser: User })[];
  isHighlighted?: boolean;
  postRef?: React.RefObject<HTMLDivElement>;
}) {
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [selectedConnections, setSelectedConnections] = useState<string[]>([]);

  // Fetch comments
  const { data: comments = [], isLoading: commentsLoading } = useQuery<EnrichedComment[]>({
    queryKey: ["/api/posts", post.id, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
    enabled: showComments,
  });

  // React to post mutation
  const reactMutation = useMutation({
    mutationFn: async (type: "like" | "dislike") => {
      return apiRequest("POST", `/api/posts/${post.id}/react`, { type });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: () => {
      toast({
        title: t("errors.general"),
        variant: "destructive",
      });
    },
  });

  // Add comment mutation
  const commentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/posts/${post.id}/comments`, { content });
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["/api/posts", post.id, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: () => {
      toast({
        title: t("errors.general"),
        variant: "destructive",
      });
    },
  });

  // Delete post mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/posts/${post.id}`);
    },
    onSuccess: () => {
      toast({
        title: t("posts.postDeleted"),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: () => {
      toast({
        title: t("errors.general"),
        variant: "destructive",
      });
    },
  });

  // Share post mutation
  const shareMutation = useMutation({
    mutationFn: async (connectionIds: string[]) => {
      const postUrl = `${window.location.origin}/posts?highlight=${post.id}`;
      const shareMessage = `${t("posts.sharedPost")}: "${post.content.slice(0, 50)}${post.content.length > 50 ? "..." : ""}"`;
      
      // Send message to each selected connection
      await Promise.all(connectionIds.map(userId => 
        apiRequest("POST", "/api/messages", {
          receiverId: userId,
          content: `${shareMessage}\n\n${postUrl}`,
        })
      ));
    },
    onSuccess: () => {
      toast({ title: t("posts.postShared") });
      setShareDialogOpen(false);
      setSelectedConnections([]);
    },
    onError: () => {
      toast({ title: t("errors.general"), variant: "destructive" });
    },
  });

  const handleReact = (type: "like" | "dislike") => {
    if (!currentUser) return;
    reactMutation.mutate(type);
  };

  const handleShare = () => {
    if (selectedConnections.length === 0) return;
    shareMutation.mutate(selectedConnections);
  };

  const toggleConnectionSelection = (userId: string) => {
    setSelectedConnections(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleComment = () => {
    if (!commentText.trim() || !currentUser) return;
    commentMutation.mutate(commentText.trim());
  };

  const isOwnPost = currentUser?.id === post.userId;

  return (
    <>
      <Card 
        ref={postRef}
        className={`mb-4 overflow-hidden transition-all duration-500 ${
          isHighlighted 
            ? "ring-2 ring-primary shadow-lg shadow-primary/20 animate-pulse" 
            : ""
        }`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Link href={`/profile/${post.user.id}`}>
                <Avatar className="w-10 h-10 sm:w-12 sm:h-12 cursor-pointer hover:ring-2 hover:ring-primary/20 transition-all">
                  <AvatarImage src={post.user.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(post.user.fullName || post.user.name || "")}
                  </AvatarFallback>
                </Avatar>
              </Link>
              <div>
                <Link href={`/profile/${post.user.id}`}>
                  <p className="font-semibold text-sm sm:text-base hover:underline cursor-pointer">
                    {post.user.fullName || post.user.name}
                  </p>
                </Link>
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  {post.user.jobPosition && (
                    <>
                      <span className="truncate max-w-[150px] sm:max-w-none">{post.user.jobPosition}</span>
                      <span>·</span>
                    </>
                  )}
                  <span>{formatTimeAgo(post.createdAt, t)}</span>
                </div>
              </div>
            </div>
            {isOwnPost && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t("posts.deletePost")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm sm:text-base whitespace-pre-wrap mb-4">{post.content}</p>
          
          {post.imageUrl && (
            <div className="rounded-lg overflow-hidden mb-4 bg-muted">
              <img
                src={post.imageUrl}
                alt="Post image"
                className="w-full max-h-[500px] object-contain"
              />
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
            {(post.likesCount > 0 || post.dislikesCount > 0) && (
              <span>
                {post.likesCount > 0 && `${post.likesCount} ${t("posts.likes")}`}
                {post.likesCount > 0 && post.dislikesCount > 0 && " · "}
                {post.dislikesCount > 0 && `${post.dislikesCount} ${t("posts.dislikes")}`}
              </span>
            )}
            {post.commentsCount > 0 && (
              <span>{post.commentsCount} {t("posts.comments").toLowerCase()}</span>
            )}
          </div>

          <Separator className="mb-3" />

          {/* Actions */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <Button
                variant={post.userReaction === "like" ? "default" : "ghost"}
                size="sm"
                className="gap-1 sm:gap-2"
                onClick={() => handleReact("like")}
                disabled={!currentUser || reactMutation.isPending}
              >
                <ThumbsUp className="w-4 h-4" />
                <span className="hidden sm:inline">{t("posts.like")}</span>
              </Button>
              <Button
                variant={post.userReaction === "dislike" ? "default" : "ghost"}
                size="sm"
                className="gap-1 sm:gap-2"
                onClick={() => handleReact("dislike")}
                disabled={!currentUser || reactMutation.isPending}
              >
                <ThumbsDown className="w-4 h-4" />
                <span className="hidden sm:inline">{t("posts.dislike")}</span>
              </Button>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              {currentUser && connections.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 sm:gap-2"
                  onClick={() => setShareDialogOpen(true)}
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">{t("posts.share")}</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 sm:gap-2"
                onClick={() => setShowComments(!showComments)}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">{t("posts.comment")}</span>
                {showComments ? (
                  <ChevronUp className="w-4 h-4 ml-1" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-1" />
                )}
              </Button>
            </div>
          </div>

          {/* Comments Section */}
          {showComments && (
            <div className="mt-4 pt-4 border-t">
              {/* Add comment input */}
              {currentUser && (
                <div className="flex gap-3 mb-4">
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={currentUser.avatarUrl || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {getInitials(currentUser.fullName || currentUser.name || "")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 flex gap-2">
                    <Input
                      placeholder={t("posts.addComment")}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleComment();
                        }
                      }}
                      disabled={commentMutation.isPending}
                      className="flex-1"
                    />
                    <Button
                      size="icon"
                      onClick={handleComment}
                      disabled={!commentText.trim() || commentMutation.isPending}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Comments list */}
              {commentsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t("posts.noComments")} {t("posts.beFirstComment")}
                </p>
              ) : (
                <div className="space-y-1">
                  {comments.map((comment) => (
                    <CommentItem key={comment.id} comment={comment} t={t} />
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("posts.deletePost")}</DialogTitle>
            <DialogDescription>{t("posts.deleteConfirm")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteMutation.mutate();
                setDeleteDialogOpen(false);
              }}
            >
              {t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={(open) => {
        setShareDialogOpen(open);
        if (!open) setSelectedConnections([]);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("posts.sharePost")}</DialogTitle>
            <DialogDescription>{t("posts.selectConnections")}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px] pr-4">
            {connections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("posts.noConnectionsToShare")}
              </p>
            ) : (
              <div className="space-y-2">
                {connections.map((conn) => (
                  <div
                    key={conn.otherUser.id}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConnections.includes(conn.otherUser.id)
                        ? "bg-primary/10"
                        : "hover:bg-muted"
                    }`}
                    onClick={() => toggleConnectionSelection(conn.otherUser.id)}
                  >
                    <Checkbox
                      checked={selectedConnections.includes(conn.otherUser.id)}
                      onCheckedChange={() => toggleConnectionSelection(conn.otherUser.id)}
                    />
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={conn.otherUser.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {getInitials(conn.otherUser.fullName || conn.otherUser.name || "")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {conn.otherUser.fullName || conn.otherUser.name}
                      </p>
                      {conn.otherUser.jobPosition && (
                        <p className="text-xs text-muted-foreground truncate">
                          {conn.otherUser.jobPosition}
                        </p>
                      )}
                    </div>
                    {selectedConnections.includes(conn.otherUser.id) && (
                      <Check className="w-5 h-5 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleShare}
              disabled={selectedConnections.length === 0 || shareMutation.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              {t("posts.sendTo")} ({selectedConnections.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PostsPage() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const highlightedPostRef = useRef<HTMLDivElement>(null);
  const searchString = useSearch();
  
  const [postContent, setPostContent] = useState("");
  const [postImage, setPostImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "likes">("newest");
  const [filterBy, setFilterBy] = useState<"all" | "connections">("all");
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);

  // Parse highlight query parameter
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const highlightId = params.get("highlight");
    if (highlightId) {
      setHighlightedPostId(highlightId);
      // Remove highlight after 3 seconds
      const timer = setTimeout(() => {
        setHighlightedPostId(null);
        // Clean URL
        window.history.replaceState({}, "", "/posts");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [searchString]);

  // Scroll to highlighted post
  useEffect(() => {
    if (highlightedPostId && highlightedPostRef.current) {
      highlightedPostRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedPostId]);

  // Fetch connections for sharing
  const { data: connections = [] } = useQuery<(Connection & { otherUser: User })[]>({
    queryKey: ["/api/connections/accepted"],
    enabled: !!currentUser,
  });

  // Fetch random shorts for the REALS promo section
  const { data: randomShorts = [] } = useQuery<(Short & { user: User })[]>({
    queryKey: ["/api/shorts", "random"],
    queryFn: async () => {
      const res = await fetch("/api/shorts?limit=4&random=true", {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch posts
  const { data: posts = [], isLoading } = useQuery<EnrichedPost[]>({
    queryKey: ["/api/posts", sortBy, filterBy],
    queryFn: async () => {
      const res = await fetch(`/api/posts?sortBy=${sortBy}&filterBy=${filterBy}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  // Create post mutation
  const createPostMutation = useMutation({
    mutationFn: async () => {
      let imageUrl = null;
      
      // Upload image if exists
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        
        const uploadRes = await fetch("/api/upload/post-image", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        
        if (!uploadRes.ok) {
          throw new Error("Failed to upload image");
        }
        
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
      }
      
      return apiRequest("POST", "/api/posts", {
        content: postContent.trim(),
        imageUrl,
      });
    },
    onSuccess: () => {
      toast({
        title: t("posts.postCreated"),
      });
      setPostContent("");
      setPostImage(null);
      setImageFile(null);
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: () => {
      toast({
        title: t("errors.general"),
        variant: "destructive",
      });
    },
  });

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPostImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setPostImage(null);
    setImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handlePublish = () => {
    if (!postContent.trim()) return;
    createPostMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
          {t("posts.title")}
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          {t("posts.subtitle")}
        </p>
      </div>

      {/* Create Post Card */}
      {currentUser && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-3 sm:gap-4">
              <Avatar className="w-10 h-10 sm:w-12 sm:h-12">
                <AvatarImage src={currentUser.avatarUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(currentUser.fullName || currentUser.name || "")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <Textarea
                  placeholder={t("posts.whatOnYourMind")}
                  value={postContent}
                  onChange={(e) => setPostContent(e.target.value)}
                  className="min-h-[100px] resize-none mb-3"
                />
                
                {/* Image preview */}
                {postImage && (
                  <div className="relative mb-3 rounded-lg overflow-hidden bg-muted inline-block">
                    <img
                      src={postImage}
                      alt="Preview"
                      className="max-h-[200px] w-auto object-contain"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={removeImage}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                )}
                
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus className="w-4 h-4 mr-2" />
                      <span className="hidden sm:inline">{t("posts.addImage")}</span>
                    </Button>
                  </div>
                  <Button
                    onClick={handlePublish}
                    disabled={!postContent.trim() || createPostMutation.isPending}
                  >
                    {createPostMutation.isPending ? t("posts.publishing") : t("posts.publish")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                {filterBy === "all" ? t("posts.filterAll") : t("posts.filterConnections")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setFilterBy("all")}>
                <FileText className="w-4 h-4 mr-2" />
                {t("posts.filterAll")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilterBy("connections")}>
                <Users className="w-4 h-4 mr-2" />
                {t("posts.filterConnections")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                {sortBy === "newest" ? t("posts.sortNewest") : t("posts.sortMostLiked")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy("newest")}>
                <Clock className="w-4 h-4 mr-2" />
                {t("posts.sortNewest")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("likes")}>
                <TrendingUp className="w-4 h-4 mr-2" />
                {t("posts.sortMostLiked")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* REALS Promo Section */}
      {randomShorts.length > 0 && (
        <Card className="mb-6 overflow-hidden bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Video className="w-5 h-5 text-primary" />
                  {t("reals.promoTitle")}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("reals.promoDescription")}
                </p>
              </div>
              <Link href="/reals">
                <Button variant="default" className="gap-2 whitespace-nowrap">
                  {t("reals.promoButton")}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
            
            {/* Random Shorts Grid - 3 on mobile, 4 on desktop */}
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {randomShorts.slice(0, 4).map((short, index) => (
                <Link key={short.id} href={`/reals?id=${short.id}`} className={index === 3 ? "hidden lg:block" : ""}>
                  <div className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-black cursor-pointer">
                    {short.thumbnailUrl ? (
                      <img
                        src={short.thumbnailUrl}
                        alt={short.title || ""}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={short.videoUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                    )}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                      <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="absolute bottom-1 left-1 right-1">
                      <p className="text-[10px] sm:text-xs text-white truncate font-medium drop-shadow-lg">
                        {short.user.fullName || short.user.name}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Posts Feed */}
      {isLoading ? (
        <div className="space-y-4">
          <PostSkeleton />
          <PostSkeleton />
          <PostSkeleton />
        </div>
      ) : posts.length === 0 ? (
        <Card className="py-12">
          <CardContent className="text-center">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-semibold text-lg mb-2">{t("posts.noPosts")}</h3>
            <p className="text-muted-foreground">{t("posts.noPostsDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <div>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUser={currentUser}
              t={t}
              connections={connections}
              isHighlighted={highlightedPostId === post.id}
              postRef={highlightedPostId === post.id ? highlightedPostRef : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}


