import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useOpenChat } from "@/components/chat-tray";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserCard } from "@/components/user-card";
import { InterestFilter } from "@/components/interest-filter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users, SlidersHorizontal, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { User } from "@shared/schema";

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

type SortOption = "match" | "recent" | "name";

export default function Discover() {
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const openChat = useOpenChat();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortOption>("match");
  const [showFilters, setShowFilters] = useState(false);

  const buildUsersUrl = () => {
    const params = new URLSearchParams();
    if (selectedInterests.length > 0) {
      params.set("interests", selectedInterests.join(","));
    }
    if (searchQuery) {
      params.set("search", searchQuery);
    }
    const queryString = params.toString();
    return queryString ? `/api/users?${queryString}` : "/api/users";
  };

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users", selectedInterests.join(","), searchQuery],
    queryFn: async () => {
      const res = await fetch(buildUsersUrl(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
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
      toast({
        title: "Connection request sent",
        description: "You'll be notified when they respond.",
      });
    },
    onError: () => {
      toast({
        title: t("errors.connectionFailed"),
        description: t("errors.tryAgain"),
        variant: "destructive",
      });
    },
  });

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const clearFilters = () => {
    setSelectedInterests([]);
    setSearchQuery("");
  };

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

  const sortedUsers = [...(users || [])].sort((a, b) => {
    if (sortBy === "name") {
      return (a.name || "").localeCompare(b.name || "");
    }
    if (sortBy === "match" && currentUser) {
      const aMatches = (a.interests || []).filter((i) =>
        (currentUser.interests || []).includes(i)
      ).length;
      const bMatches = (b.interests || []).filter((i) =>
        (currentUser.interests || []).includes(i)
      ).length;
      return bMatches - aMatches;
    }
    return 0;
  });

  const filteredUsers = sortedUsers.filter(
    (user) => user.id !== currentUser?.id
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          {t("discover.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("discover.subtitle")}
        </p>
      </div>

      {/* Search and Filters */}
      <div className="space-y-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("discover.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-users"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery("")}
                data-testid="button-clear-search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-[160px]" data-testid="select-sort">
                <SelectValue placeholder={t("discover.sortBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="match">{t("discover.bestMatch")}</SelectItem>
                <SelectItem value="recent">{t("discover.recentlyActive")}</SelectItem>
                <SelectItem value="name">{t("discover.nameAZ")}</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant={showFilters ? "secondary" : "outline"}
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
              data-testid="button-toggle-filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
              {t("discover.filters")}
              {selectedInterests.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                  {selectedInterests.length}
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Interest Filters */}
        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <InterestFilter
                selectedInterests={selectedInterests}
                onToggleInterest={toggleInterest}
                onClearAll={clearFilters}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Results Count */}
      {!isLoading && (
        <p className="text-sm text-muted-foreground mb-4">
          {filteredUsers.length === 1 
            ? t("discover.personFound")
            : t("discover.peopleFound", { count: filteredUsers.length })
          }
          {selectedInterests.length > 0 && ` ${t("discover.matchingFilters")}`}
        </p>
      )}

      {/* User Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <UserCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredUsers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map((user) => {
            const status = getConnectionStatus(user.id);
            return (
              <UserCard
                key={user.id}
                user={user}
                currentUserInterests={currentUser?.interests || []}
                isConnected={status.isConnected}
                isPending={status.isPending}
                onConnect={(userId) => connectMutation.mutate(userId)}
                onViewProfile={(userId) => navigate(`/profile/${userId}`)}
                onMessage={(u) => openChat(u)}
              />
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16">
            <div className="text-center">
              <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                {t("discover.noUsersFound")}
              </h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                {selectedInterests.length > 0 || searchQuery
                  ? t("discover.adjustFilters")
                  : t("discover.noUsersYet")}
              </p>
              {(selectedInterests.length > 0 || searchQuery) && (
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  data-testid="button-clear-all-filters"
                >
                  {t("discover.clearFilters")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
