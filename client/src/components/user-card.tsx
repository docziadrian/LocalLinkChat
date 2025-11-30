import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { UserPlus, Check, MessageSquare } from "lucide-react";
import type { User } from "@shared/schema";

interface UserCardProps {
  user: User;
  currentUserInterests?: string[];
  isConnected?: boolean;
  isPending?: boolean;
  onConnect?: (userId: string) => void;
  onViewProfile?: (userId: string) => void;
  onMessage?: (user: User) => void;
}

export function UserCard({
  user,
  currentUserInterests = [],
  isConnected = false,
  isPending = false,
  onConnect,
  onViewProfile,
  onMessage,
}: UserCardProps) {
  const { t } = useI18n();

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const interests = user.interests || [];
  const sharedInterests = interests.filter((interest) =>
    currentUserInterests.includes(interest)
  );

  const matchPercentage = currentUserInterests.length > 0
    ? Math.round((sharedInterests.length / currentUserInterests.length) * 100)
    : 0;

  const displayInterests = interests.slice(0, 4);
  const remainingCount = interests.length - displayInterests.length;

  const displayName = user.fullName || user.name || user.email.split("@")[0];

  return (
    <Card 
      className="group hover-elevate active-elevate-2 cursor-pointer transition-all duration-200"
      data-testid={`card-user-${user.id}`}
    >
      <CardContent className="p-6">
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <Avatar className="w-16 h-16 border-2 border-background">
              <AvatarImage src={user.avatarUrl || undefined} alt={displayName} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            {user.isOnline && (
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-background rounded-full" />
            )}
          </div>

          <h3 
            className="font-semibold text-foreground mb-1 line-clamp-1"
            data-testid={`text-username-${user.id}`}
          >
            {displayName}
          </h3>
          
          {user.jobPosition && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-1">
              {user.jobPosition}
            </p>
          )}

          {user.bio && (
            <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
              {user.bio}
            </p>
          )}

          {matchPercentage > 0 && (
            <div className="mb-3">
              <Badge variant="secondary" className="text-xs">
                {t("discover.match", { percent: matchPercentage })}
              </Badge>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-1.5 mb-4 min-h-[52px]">
            {displayInterests.map((interest) => (
              <Badge
                key={interest}
                variant={sharedInterests.includes(interest) ? "default" : "outline"}
                className="text-xs"
              >
                {interest}
              </Badge>
            ))}
            {remainingCount > 0 && (
              <Badge variant="outline" className="text-xs">
                +{remainingCount}
              </Badge>
            )}
          </div>

          <div className="flex gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onViewProfile?.(user.id);
              }}
              data-testid={`button-view-profile-${user.id}`}
            >
              {t("common.viewProfile")}
            </Button>
            {isConnected ? (
              <Button
                size="sm"
                className="flex-1"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onMessage?.(user);
                }}
                data-testid={`button-message-${user.id}`}
              >
                <MessageSquare className="w-3 h-3 mr-1" />
                {t("common.message")}
              </Button>
            ) : (
              <Button
                size="sm"
                className="flex-1"
                disabled={isConnected || isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  onConnect?.(user.id);
                }}
                data-testid={`button-connect-${user.id}`}
              >
                {isPending ? (
                  t("common.pending")
                ) : (
                  <>
                    <UserPlus className="w-3 h-3 mr-1" />
                    {t("common.connect")}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
