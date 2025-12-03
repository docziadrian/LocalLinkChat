import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useI18n, languageNames, languageFlags, type SupportedLanguage } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupContent,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Home, 
  FileText,
  Video,
  Users, 
  User,
  MessageSquare,
  Bell,
  Handshake,
  Globe,
  ChevronDown
} from "lucide-react";

export function AppSidebar() {
  const [location] = useLocation();
  const { t, language, setLanguage } = useI18n();
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const { setOpenMobile } = useSidebar();

  // Notification count
  const { data: unreadNotifications } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 10000,
  });

  // Unread messages count
  const { data: unreadMessages } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const messageCount = unreadMessages?.count ?? 0;
  const notificationCount = unreadNotifications?.count ?? 0;

  // Close mobile sidebar when navigating
  const handleNavClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer" data-testid="link-logo">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <Handshake className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground">LocalLinkChat</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className={isMobile ? "gap-2" : "gap-1"}>
              {/* Dashboard */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/"} size={isMobile ? "lg" : "default"}>
                  <Link href="/" data-testid="nav-dashboard" onClick={handleNavClick}>
                    <Home className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                    <span className={isMobile ? "text-base" : ""}>{t("nav.dashboard")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Posts */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/posts"} size={isMobile ? "lg" : "default"}>
                  <Link href="/posts" data-testid="nav-posts" onClick={handleNavClick}>
                    <FileText className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                    <span className={isMobile ? "text-base" : ""}>{t("nav.posts")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* REALS */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/reals"} size={isMobile ? "lg" : "default"}>
                  <Link href="/reals" data-testid="nav-reals" onClick={handleNavClick}>
                    <Video className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                    <span className={isMobile ? "text-base" : ""}>{t("nav.reels")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Discover */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/discover"} size={isMobile ? "lg" : "default"}>
                  <Link href="/discover" data-testid="nav-discover" onClick={handleNavClick}>
                    <Users className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                    <span className={isMobile ? "text-base" : ""}>{t("nav.discover")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Messages */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/messages"} size={isMobile ? "lg" : "default"}>
                  <Link href="/messages" data-testid="nav-messages" className="relative" onClick={handleNavClick}>
                    <div className="relative">
                      <MessageSquare className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                      {messageCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                    </div>
                    <span className={isMobile ? "text-base" : ""}>{t("nav.messages")}</span>
                    {messageCount > 0 && (
                      <Badge 
                        variant="default"
                        className={`ml-auto flex items-center justify-center text-xs px-1.5 ${isMobile ? "h-6 min-w-6" : "h-5 min-w-5"}`}
                      >
                        {messageCount > 99 ? "99+" : messageCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Notifications */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/notifications"} size={isMobile ? "lg" : "default"}>
                  <Link href="/notifications" data-testid="nav-notifications" className="relative" onClick={handleNavClick}>
                    <div className="relative">
                      <Bell className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                      {notificationCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      )}
                    </div>
                    <span className={isMobile ? "text-base" : ""}>{t("nav.notifications")}</span>
                    {notificationCount > 0 && (
                      <Badge 
                        variant="destructive"
                        className={`ml-auto flex items-center justify-center text-xs px-1.5 ${isMobile ? "h-6 min-w-6" : "h-5 min-w-5"}`}
                      >
                        {notificationCount > 99 ? "99+" : notificationCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Profile */}
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/profile"} size={isMobile ? "lg" : "default"}>
                  <Link href="/profile" data-testid="nav-profile" onClick={handleNavClick}>
                    <User className={isMobile ? "w-5 h-5" : "w-4 h-4"} />
                    <span className={isMobile ? "text-base" : ""}>{t("nav.profile")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span>{languageFlags[language]} {languageNames[language]}</span>
              </div>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {(Object.keys(languageNames) as SupportedLanguage[]).map((lang) => (
              <DropdownMenuItem
                key={lang}
                onClick={() => setLanguage(lang)}
                className={language === lang ? "bg-accent" : ""}
              >
                <span className="mr-2">{languageFlags[lang]}</span>
                {languageNames[lang]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
