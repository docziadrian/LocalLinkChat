import { useState, useEffect, useRef, useCallback } from "react";
import { Switch, Route, Link, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { ThemeToggle } from "@/components/theme-toggle";
import { LiveChat, type LiveChatRef } from "@/components/live-chat";
import { ChatTray } from "@/components/chat-tray";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { 
  User as UserIcon, 
  LogOut, 
  Settings,
  Loader2,
  Headphones
} from "lucide-react";
import HomePage from "@/pages/home";
import PostsPage from "@/pages/posts";
import RealsPage from "@/pages/reals";
import DiscoverPage from "@/pages/discover";
import MessagesPage from "@/pages/messages";
import NotificationsPage from "@/pages/notifications";
import ProfilePage from "@/pages/profile";
import LoginPage from "@/pages/login";
import SetupPage from "@/pages/setup";
import NotFound from "@/pages/not-found";
import type { ChatMessage } from "@shared/schema";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, profileCompleted } = useAuth();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (!profileCompleted) {
    return <Redirect to="/setup" />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { t } = useI18n();
  const { user, isAuthenticated, profileCompleted, logout, isLoading } = useAuth();
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [supportChatFullscreen, setSupportChatFullscreen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const liveChatRef = useRef<LiveChatRef>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountedRef = useRef(false);

  const cleanupWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      if (wsRef.current.readyState === WebSocket.OPEN || 
          wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (isUnmountedRef.current) return;
    if (!isAuthenticated || !user) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;
      
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        if (isUnmountedRef.current) {
          socket.close();
          return;
        }
        setIsConnected(true);
        
        // Identify user to server
        socket.send(JSON.stringify({
          type: "connect",
          userId: user.id,
        }));

        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      socket.onmessage = (event) => {
        if (isUnmountedRef.current) return;
        try {
          const message = JSON.parse(event.data);
          if (message.type === "chat") {
            setChatMessages((prev) => [...prev, message.data]);
          } else if (message.type === "notification") {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
          } else if (message.type === "direct_message") {
            // Invalidate conversations and unread count for real-time updates
            queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
            queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
          } else if (message.type === "connection_accepted") {
            // When a connection is accepted, refresh connections and messages
            queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
            queryClient.invalidateQueries({ queryKey: ["/api/connections/accepted"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
            queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
          }
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      };

      socket.onclose = () => {
        if (isUnmountedRef.current) return;
        setIsConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      };

      socket.onerror = () => {
        socket.close();
      };
    } catch (error) {
      console.error("WebSocket connection error:", error);
      if (!isUnmountedRef.current) {
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000);
      }
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    isUnmountedRef.current = false;
    
    if (isAuthenticated && user && profileCompleted) {
      const timer = setTimeout(connectWebSocket, 500);
      return () => {
        clearTimeout(timer);
      };
    }

    return () => {
      isUnmountedRef.current = true;
      cleanupWebSocket();
    };
  }, [connectWebSocket, cleanupWebSocket, isAuthenticated, user, profileCompleted]);

  const handleSendMessage = (content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && user) {
      const message = {
        type: "chat",
        content,
      };
      wsRef.current.send(JSON.stringify(message));
    }
  };

  const handleLogout = async () => {
    cleanupWebSocket();
    await logout();
    navigate("/login");
  };

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Public routes (login, setup)
  if (!isAuthenticated || !profileCompleted) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/setup">
          {isAuthenticated ? <SetupPage /> : <Redirect to="/login" />}
        </Route>
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />

        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <header className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
            </div>

            <div className="flex items-center gap-2">
              <ThemeToggle />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    data-testid="button-user-menu"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={user?.avatarUrl || undefined}
                        alt={user?.name || "User"}
                      />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {user?.name ? getInitials(user.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center gap-2 p-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user?.avatarUrl || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {user?.name ? getInitials(user.name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-medium">{user?.fullName || user?.name || "User"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.email || ""}
                      </p>
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer" data-testid="menu-profile">
                      <UserIcon className="w-4 h-4 mr-2" />
                      {t("nav.profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menu-settings">
                    <Settings className="w-4 h-4 mr-2" />
                    {t("nav.settings")}
                  </DropdownMenuItem>
                  {/* Support Chat - Mobile only */}
                  {isMobile && (
                    <DropdownMenuItem 
                      onClick={() => setSupportChatFullscreen(true)}
                      data-testid="menu-support"
                    >
                      <Headphones className="w-4 h-4 mr-2" />
                      {t("chat.liveSupport")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="text-destructive cursor-pointer" 
                    onClick={handleLogout}
                    data-testid="menu-logout"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("auth.logOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto p-3 sm:p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              <Switch>
                <Route path="/" component={HomePage} />
                <Route path="/posts" component={PostsPage} />
                <Route path="/reals" component={RealsPage} />
                <Route path="/discover" component={DiscoverPage} />
                <Route path="/messages">
                  <MessagesPage wsRef={wsRef} />
                </Route>
                <Route path="/notifications" component={NotificationsPage} />
                <Route path="/profile" component={ProfilePage} />
                <Route path="/profile/:id" component={ProfilePage} />
                <Route component={NotFound} />
              </Switch>
            </div>
          </main>
        </div>
      </div>

      {/* Live Chat */}
      <LiveChat
        ref={liveChatRef}
        messages={chatMessages}
        onSendMessage={handleSendMessage}
        isConnected={isConnected}
        currentUserId={user?.id || ""}
        currentUserName={user?.name || "User"}
        isFullscreen={supportChatFullscreen}
        onClose={() => setSupportChatFullscreen(false)}
      />

      {/* Chat Tray for direct messages */}
      <ChatTray wsRef={wsRef} />
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="localconnect-theme">
        <I18nProvider>
          <AuthProvider>
            <TooltipProvider>
              <AppContent />
              <Toaster />
            </TooltipProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
