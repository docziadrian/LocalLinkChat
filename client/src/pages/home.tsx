import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useOpenChat } from "@/components/chat-tray";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatsCard } from "@/components/stats-card";
import { ActivityFeed } from "@/components/activity-feed";
import { UserCard } from "@/components/user-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Users, 
  UserPlus, 
  MessageSquare, 
  Sparkles, 
  ArrowRight
} from "lucide-react";
import type { User, ActivityItem } from "@shared/schema";

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

export default function Home() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const openChat = useOpenChat();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: recommendations, isLoading: recommendationsLoading } = useQuery<User[]>({
    queryKey: ["/api/users/recommendations"],
  });

  const { data: activities, isLoading: activitiesLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/activities"],
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
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
              <CardTitle className="text-lg font-semibold">
                {t("dashboard.peopleYouMightKnow")}
              </CardTitle>
              <Link href="/discover">
                <Button variant="ghost" size="sm" data-testid="link-see-all">
                  {t("common.seeAll")}
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recommendationsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <UserCardSkeleton />
                  <UserCardSkeleton />
                </div>
              ) : recommendations && recommendations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recommendations.slice(0, 4).map((user) => {
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
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="font-medium text-foreground mb-2">
                    {t("dashboard.noRecommendations")}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("dashboard.completeProfileForRecommendations")}
                  </p>
                  <Link href="/profile">
                    <Button data-testid="button-complete-profile">
                      {t("dashboard.completeProfile")}
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">{t("dashboard.quickActions")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Link href="/discover">
                  <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-browse-community">
                    <Users className="h-4 w-4" />
                    {t("dashboard.browseCommunity")}
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-update-interests">
                    <Sparkles className="h-4 w-4" />
                    {t("dashboard.updateInterests")}
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-start gap-2" data-testid="button-get-support">
                  <MessageSquare className="h-4 w-4" />
                  {t("dashboard.getSupport")}
                </Button>
              </div>
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
      </div>
    </div>
  );
}
