import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { UserPlus, Users, Sparkles } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ActivityItem } from "@shared/schema";

interface ActivityFeedProps {
  activities: ActivityItem[];
  isLoading?: boolean;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ActivitySkeleton() {
  return (
    <div className="flex gap-3 py-3">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
  const { t } = useI18n();

  const getActivityIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "new_member":
        return <UserPlus className="w-4 h-4" />;
      case "new_connection":
        return <Users className="w-4 h-4" />;
      case "interest_match":
        return <Sparkles className="w-4 h-4" />;
      default:
        return <Users className="w-4 h-4" />;
    }
  };

  const getActivityMessage = (activity: ActivityItem) => {
    switch (activity.type) {
      case "new_member":
        return (
          <span>
            <span className="font-medium">{activity.userName}</span>{" "}
            {t("activity.newMember")}
          </span>
        );
      case "new_connection":
        return (
          <span>
            <span className="font-medium">{activity.userName}</span>{" "}
            {t("activity.newConnection")}{" "}
            <span className="font-medium">{activity.targetUserName}</span>
          </span>
        );
      case "interest_match":
        return (
          <span>
            <span className="font-medium">{activity.userName}</span>{" "}
            {t("activity.interestMatch")}{" "}
            {activity.interests?.slice(0, 2).join(", ")}
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px]">
          <div className="px-6 pb-6 space-y-1">
            {isLoading ? (
              <>
                <ActivitySkeleton />
                <ActivitySkeleton />
                <ActivitySkeleton />
                <ActivitySkeleton />
              </>
            ) : activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No recent activity
              </p>
            ) : (
              activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex gap-3 py-3 border-b last:border-0"
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarImage
                        src={activity.userAvatar}
                        alt={activity.userName}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(activity.userName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background flex items-center justify-center border">
                      {getActivityIcon(activity.type)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      {getActivityMessage(activity)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(activity.timestamp), {
                        addSuffix: true,
                      })}
                    </p>
                    {activity.type === "interest_match" && activity.interests && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {activity.interests.slice(0, 3).map((interest) => (
                          <Badge
                            key={interest}
                            variant="outline"
                            className="text-xs"
                          >
                            {interest}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
