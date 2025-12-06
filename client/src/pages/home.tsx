import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useOpenChat } from "@/components/chat-tray";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatsCard } from "@/components/stats-card";
import { ActivityFeed } from "@/components/activity-feed";
import { UserCard } from "@/components/user-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRef } from "react";
import { LiveChat, type LiveChatRef } from "@/components/live-chat";
import { 
  Users, 
  UserPlus, 
  MessageSquare, 
  Sparkles, 
  ArrowRight,
  FileText,
  Video,
  UserIcon,
  Headphones,
  Settings,
  ThumbsUp,
  Clock,
  Image as ImageIcon
} from "lucide-react";
import type { User, ActivityItem, Post } from "@shared/schema";

interface DashboardStats {
  totalConnections: number;
  pendingRequests: number;
  messagesSent: number;
  matchScore: number;
}

function UserCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col items-center animate-pulse">
          <Skeleton className="w-16 h-16 rounded-full mb-4" />
          <Skeleton className="h-5 w-24 mb-2" />
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="flex gap-1 mb-4">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="flex gap-2 w-full">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
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

export default function Home() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const openChat = useOpenChat();
  const liveChatRef = useRef<LiveChatRef>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: recommendations, isLoading: recommendationsLoading } = useQuery<User[]>({
    queryKey: ["/api/users/recommendations"],
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/activities"],
  });

  // Fetch recent posts for display on home page
  const { data: recentPosts = [], isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/posts?sortBy=newest&limit=3", {
        credentials: "include",
      });
      if (!res.ok) return [];
      const posts = await res.json();
      return posts;
    },
  });

  const { data: connections } = useQuery<{ id: string; status: string; receiverId: string; requesterId: string }[]>({
    queryKey: ["/api/connections"],
  });

  const connectMutation = useMutation({
    mutationFn: async (receiverId: string) => {
      return apiRequest("POST", "/api/connections", { receiverId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Connection request sent",
        description: "You'll be notified when they respond.",
      });
    },
    onError: () => {
      toast({
        title: t("errors.connectionFailed"),
        variant: "destructive",
      });
    },
  });

  // Check if already connected or pending with a user
  const getConnectionStatus = (userId: string) => {
    const connection = connections?.find(
      (c) => c.receiverId === userId || c.requesterId === userId
    );
    if (!connection) return { isConnected: false, isPending: false };
    return {
      isConnected: connection.status === "accepted",
      isPending: connection.status === "pending",
    };
  };

  // Get the first name from fullName or name
  const firstName = currentUser?.fullName?.split(" ")[0] || currentUser?.name?.split(" ")[0];

  return (
    <div className="min-h-screen">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {firstName 
            ? `${t("dashboard.welcomeBack")}, ${firstName}!`
            : `${t("dashboard.welcomeGuest")}!`
          }
        </h1>
        <p className="text-muted-foreground">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <Card key={i}>
                <CardContent className="p-6 animate-pulse">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title={t("dashboard.connections")}
              value={stats?.totalConnections ?? 0}
              icon={Users}
            />
            <StatsCard
              title={t("dashboard.pendingRequests")}
              value={stats?.pendingRequests ?? 0}
              icon={UserPlus}
            />
            <StatsCard
              title={t("dashboard.messagesSent")}
              value={stats?.messagesSent ?? 0}
              icon={MessageSquare}
            />
            <StatsCard
              title={t("dashboard.matchScore")}
              value={`${stats?.matchScore ?? 0}%`}
              icon={Sparkles}
              description={t("dashboard.basedOnInterests")}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recommendations Section */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-base font-semibold">
                {t("dashboard.peopleYouMightKnow")}
              </CardTitle>
              <Link href="/discover">
                <Button variant="ghost" size="sm" data-testid="link-see-all">
                  {t("common.seeAll")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pb-3">
              {recommendationsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <UserCardSkeleton />
                  <UserCardSkeleton />
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {recommendations.slice(0, 2).map((user) => {
                    const status = getConnectionStatus(user.id);
                    return (
                      <UserCard
                        key={user.id}
                        user={user}
                        currentUserInterests={currentUser?.interests || []}
                        isConnected={status.isConnected}
                        isPending={status.isPending}
                        onConnect={(userId) => connectMutation.mutate(userId)}
                        onViewProfile={(userId) => {
                          window.location.href = `/profile/${userId}`;
                        }}
                        onMessage={(u) => openChat(u)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Users className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                  <h3 className="font-medium text-sm text-foreground mb-1">
                    {t("dashboard.noRecommendations")}
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {t("dashboard.completeProfileForRecommendations")}
                  </p>
                  <Link href="/profile">
                    <Button size="sm" data-testid="button-complete-profile">
                      {t("dashboard.completeProfile")}
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-1">
          <ActivityFeed 
            activities={activities || []} 
            isLoading={activitiesLoading} 
          />
        </div>

        {/* Recent Posts Section */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
              <CardTitle className="text-base font-semibold">
                {t("posts.recentPosts")}
              </CardTitle>
              <Link href="/posts">
                <Button variant="ghost" size="sm">
                  {t("common.seeAll")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pb-3">
              {postsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : recentPosts.length > 0 ? (
                <div className="space-y-3">
                  {recentPosts.map((post: any) => (
                    <Link key={post.id} href={`/posts?highlight=${post.id}`}>
                      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                        <CardContent className="p-3">
                          <div className="flex gap-3">
                            <Avatar className="w-9 h-9 flex-shrink-0">
                              <AvatarImage src={post.user?.avatarUrl || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {post.user ? getInitials(post.user.fullName || post.user.name || "") : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div>
                                  <p className="font-semibold text-sm">
                                    {post.user?.fullName || post.user?.name || "Unknown"}
                                  </p>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    {formatTimeAgo(post.createdAt, t)}
                                  </div>
                                </div>
                                {post.imageUrl && (
                                  <ImageIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {post.content}
                              </p>
                              {(post.likesCount > 0 || post.commentsCount > 0) && (
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                  {post.likesCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <ThumbsUp className="w-3 h-3" />
                                      {post.likesCount}
                                    </span>
                                  )}
                                  {post.commentsCount > 0 && (
                                    <span className="flex items-center gap-1">
                                      <MessageSquare className="w-3 h-3" />
                                      {post.commentsCount}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-xs text-muted-foreground">
                    {t("posts.noPosts")}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">{t("dashboard.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/discover">
                  <Button variant="outline" className="w-full h-auto flex-col gap-2 py-3" data-testid="button-browse-community">
                    <Users className="h-5 w-5" />
                    <span className="text-xs text-center">{t("dashboard.browseCommunity")}</span>
                  </Button>
                </Link>
                <Link href="/posts">
                  <Button variant="outline" className="w-full h-auto flex-col gap-2 py-3">
                    <FileText className="h-5 w-5" />
                    <span className="text-xs">{t("nav.posts")}</span>
                  </Button>
                </Link>
                <Link href="/reals">
                  <Button variant="outline" className="w-full h-auto flex-col gap-2 py-3">
                    <Video className="h-5 w-5" />
                    <span className="text-xs">{t("nav.reels")}</span>
                  </Button>
                </Link>
                <Link href="/messages">
                  <Button variant="outline" className="w-full h-auto flex-col gap-2 py-3">
                    <MessageSquare className="h-5 w-5" />
                    <span className="text-xs">{t("nav.messages")}</span>
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline" className="w-full h-auto flex-col gap-2 py-3" data-testid="button-update-interests">
                    <UserIcon className="h-5 w-5" />
                    <span className="text-xs">{t("nav.profile")}</span>
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="w-full h-auto flex-col gap-2 py-3" 
                  data-testid="button-get-support"
                  onClick={() => liveChatRef.current?.openChat()}
                >
                  <Headphones className="h-5 w-5" />
                  <span className="text-xs text-center">{t("dashboard.getSupport")}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Live Support Chat */}
      <LiveChat
        ref={liveChatRef}
        currentUserName={currentUser?.name || ""}
      />
    </div>

    
  );
}
