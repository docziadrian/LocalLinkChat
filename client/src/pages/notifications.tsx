import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bell, Check, X, Users, UserPlus, CheckCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User, Notification } from "@shared/schema";

interface NotificationWithUser extends Notification {
  fromUser?: User & { connectionsCount?: number };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function NotificationSkeleton() {
  return (
    <div className="flex gap-4 p-4 border-b">
      <Skeleton className="w-12 h-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
        <div className="flex gap-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  // Track connection IDs that have been handled (accepted/declined)
  const [handledConnectionIds, setHandledConnectionIds] = useState<Set<string>>(new Set());

  const { data: notifications = [], isLoading } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/notifications"],
  });

  // Auto-mark all notifications as read when page opens
  useEffect(() => {
    if (notifications.length > 0) {
      const timer = setTimeout(async () => {
        try {
          await apiRequest("POST", "/api/notifications/read-all", {});
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
        } catch (error) {
          console.error("Failed to mark notifications as read:", error);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [notifications.length]);

  const acceptMutation = useMutation({
    mutationFn: async ({ connectionId, notificationId }: { connectionId: string; notificationId: string }) => {
      // Mark notification as read first
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`, {});
      return apiRequest("PATCH", `/api/connections/${connectionId}`, { status: "accepted" });
    },
    onMutate: ({ connectionId }) => {
      setProcessingIds(prev => new Set([...Array.from(prev), connectionId]));
    },
    onSuccess: (_, { connectionId }) => {
      // Immediately mark as handled so it disappears from UI
      setHandledConnectionIds(prev => new Set([...Array.from(prev), connectionId]));
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
      
      // Invalidate queries in background
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections/accepted"] });
      
      toast({
        title: "Connection accepted!",
        description: "You can now message each other.",
      });
      
      navigate("/messages");
    },
    onError: (_, { connectionId }) => {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
      toast({
        title: "Failed to accept connection",
        variant: "destructive",
      });
    },
  });

  const declineMutation = useMutation({
    mutationFn: async ({ connectionId, notificationId }: { connectionId: string; notificationId: string }) => {
      // Mark notification as read first
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`, {});
      return apiRequest("PATCH", `/api/connections/${connectionId}`, { status: "declined" });
    },
    onMutate: ({ connectionId }) => {
      setProcessingIds(prev => new Set([...Array.from(prev), connectionId]));
    },
    onSuccess: (_, { connectionId }) => {
      // Immediately mark as handled so it disappears from UI
      setHandledConnectionIds(prev => new Set([...Array.from(prev), connectionId]));
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
      
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      
      toast({
        title: "Connection declined",
      });
    },
    onError: (_, { connectionId }) => {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(connectionId);
        return next;
      });
      toast({
        title: "Failed to decline connection",
        variant: "destructive",
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/notifications/read-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  // Filter out connection requests that are being processed or already handled
  const pendingNotifications = notifications.filter(
    (n) => n.type === "connection_request" && 
           n.connectionId && 
           !processingIds.has(n.connectionId) &&
           !handledConnectionIds.has(n.connectionId)
  );

  const otherNotifications = notifications.filter(
    (n) => n.type !== "connection_request"
  );

  const isProcessing = (connectionId: string | null) => {
    return connectionId ? processingIds.has(connectionId) : false;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">{t("notifications.title")}</h1>
        </div>
        <Card>
          <CardContent className="p-0">
            <NotificationSkeleton />
            <NotificationSkeleton />
            <NotificationSkeleton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("notifications.title")}</h1>
        {notifications.some((n) => !n.read) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {t("notifications.markAllRead")}
          </Button>
        )}
      </div>

      {pendingNotifications.length === 0 && otherNotifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Bell className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">{t("notifications.noNotifications")}</h3>
            <p className="text-muted-foreground">
              {t("notifications.noNotificationsDescription")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pending Connection Requests */}
          {pendingNotifications.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserPlus className="w-5 h-5" />
                  Connection Requests ({pendingNotifications.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[500px]">
                  {pendingNotifications.map((notification) => {
                    const processing = isProcessing(notification.connectionId);
                    return (
                      <div
                        key={notification.id}
                        className={`flex gap-4 p-4 border-b last:border-b-0 hover:bg-muted/50 ${
                          processing ? "opacity-50" : ""
                        }`}
                      >
                        <Avatar className="w-14 h-14 border-2 border-background">
                          <AvatarImage src={notification.fromUser?.avatarUrl || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                            {notification.fromUser?.name
                              ? getInitials(notification.fromUser.name)
                              : "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-foreground">
                                {notification.fromUser?.fullName || notification.fromUser?.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {notification.fromUser?.jobPosition}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                          
                          {notification.fromUser?.bio && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {notification.fromUser.bio}
                            </p>
                          )}

                          <div className="flex flex-wrap gap-1 mt-2">
                            {notification.fromUser?.interests?.slice(0, 4).map((interest) => (
                              <Badge key={interest} variant="outline" className="text-xs">
                                {interest}
                              </Badge>
                            ))}
                            {(notification.fromUser?.interests?.length || 0) > 4 && (
                              <Badge variant="outline" className="text-xs">
                                +{(notification.fromUser?.interests?.length || 0) - 4}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-4 mt-3">
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Users className="w-4 h-4" />
                              {t("notifications.connectionsCount", {
                                count: notification.fromUser?.connectionsCount || 0,
                              })}
                            </div>
                            <div className="flex gap-2 ml-auto">
                              <Button
                                size="sm"
                                onClick={() => notification.connectionId && acceptMutation.mutate({
                                  connectionId: notification.connectionId,
                                  notificationId: notification.id
                                })}
                                disabled={processing || acceptMutation.isPending || declineMutation.isPending}
                              >
                                {processing ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4 mr-1" />
                                )}
                                {t("common.accept")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => notification.connectionId && declineMutation.mutate({
                                  connectionId: notification.connectionId,
                                  notificationId: notification.id
                                })}
                                disabled={processing || acceptMutation.isPending || declineMutation.isPending}
                              >
                                {processing ? (
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                ) : (
                                  <X className="w-4 h-4 mr-1" />
                                )}
                                {t("common.decline")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* Other Notifications */}
          {otherNotifications.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {pendingNotifications.length > 0 ? "Other Notifications" : "All Notifications"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-[400px]">
                  {otherNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex gap-4 p-4 border-b last:border-b-0 ${
                        !notification.read ? "bg-primary/5" : ""
                      }`}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={notification.fromUser?.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {notification.fromUser?.name
                            ? getInitials(notification.fromUser.name)
                            : "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-medium">
                            {notification.fromUser?.fullName || notification.fromUser?.name}
                          </span>{" "}
                          {notification.type === "connection_accepted"
                            ? t("notifications.connectionAccepted")
                            : notification.message}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
