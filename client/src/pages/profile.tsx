import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useOpenChat } from "@/components/chat-tray";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Edit2, 
  Mail, 
  Briefcase, 
  Users, 
  Sparkles,
  UserPlus,
  Check,
  X,
  Camera,
  MessageSquare,
  Loader2,
  FileText,
  ArrowRight,
  Video,
  Play
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INTEREST_CATEGORIES, type User, type Post, type Short } from "@shared/schema";

const profileFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  bio: z.string().max(500, "Bio must be less than 500 characters").optional(),
  jobPosition: z.string().max(100).optional(),
  seekingDescription: z.string().max(500).optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function truncateContent(content: string, wordCount: number = 10): string {
  const words = content.split(/\s+/);
  if (words.length <= wordCount) return content;
  return words.slice(0, wordCount).join(" ") + "...";
}

function formatPostDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  });
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <Skeleton className="w-32 h-32 rounded-full" />
            <div className="flex-1 space-y-4 text-center md:text-left">
              <Skeleton className="h-8 w-48 mx-auto md:mx-0" />
              <Skeleton className="h-5 w-32 mx-auto md:mx-0" />
              <Skeleton className="h-4 w-64 mx-auto md:mx-0" />
              <div className="flex flex-wrap justify-center md:justify-start gap-2">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Profile() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user: currentUser, refetchUser, isLoading: authLoading } = useAuth();
  const openChat = useOpenChat();
  const [, params] = useRoute("/profile/:id");
  const [isEditing, setIsEditing] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [contentTab, setContentTab] = useState<'posts' | 'reals'>('posts');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = !params?.id;

  // Fetch other user's profile if viewing someone else's
  const { data: profileUser, isLoading: profileLoading } = useQuery<User>({
    queryKey: ["/api/users", params?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${params?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    enabled: !!params?.id,
  });

  const { data: connections } = useQuery<{ id: string; status: string; receiverId: string; requesterId: string }[]>({
    queryKey: ["/api/connections"],
  });

  // Fetch user's posts
  const targetUserId = params?.id || currentUser?.id;
  const { data: userPosts = [] } = useQuery<Array<Post & { user: User }>>({
    queryKey: ["/api/users", targetUserId, "posts"],
    queryFn: async () => {
      if (!targetUserId) return [];
      const res = await fetch(`/api/users/${targetUserId}/posts`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!targetUserId,
  });

  // Fetch user's REALS
  const { data: userReals = [] } = useQuery<Array<Short & { user: User }>>({
    queryKey: ["/api/users", targetUserId, "reals"],
    queryFn: async () => {
      if (!targetUserId) return [];
      const res = await fetch(`/api/users/${targetUserId}/reals`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!targetUserId,
  });

  // For own profile, use currentUser; for others, use fetched profileUser
  const user = isOwnProfile ? currentUser : profileUser;
  const isLoading = isOwnProfile ? authLoading : profileLoading;

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: "",
      fullName: "",
      email: "",
      bio: "",
      jobPosition: "",
      seekingDescription: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      return apiRequest("PATCH", "/api/users/me", {
        ...data,
        interests: selectedInterests,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetchUser();
      setIsEditing(false);
      toast({
        title: t("profile.profileUpdated"),
        description: t("profile.changesSaved"),
      });
    },
    onError: () => {
      toast({
        title: t("profile.updateFailed"),
        description: t("errors.tryAgain"),
        variant: "destructive",
      });
    },
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
    onError: (error: any) => {
      toast({
        title: error?.message || "Failed to send connection request",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    if (user) {
      form.reset({
        name: user.name || "",
        fullName: user.fullName || "",
        email: user.email,
        bio: user.bio || "",
        jobPosition: user.jobPosition || "",
        seekingDescription: user.seekingDescription || "",
      });
      setSelectedInterests(user.interests || []);
    }
    setIsEditing(true);
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch("/api/upload/profile-picture", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Upload failed");
      
      queryClient.invalidateQueries({ queryKey: ["/api/users/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetchUser();
      toast({
        title: "Profile picture updated",
      });
    } catch (error) {
      toast({
        title: t("errors.uploadFailed"),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const getConnectionStatus = () => {
    if (!params?.id || !connections) return null;
    const connection = connections.find(
      (c) => c.receiverId === params.id || c.requesterId === params.id
    );
    return connection?.status || null;
  };

  const connectionStatus = getConnectionStatus();
  const connection = connections?.find(
    (c) => c.receiverId === params?.id || c.requesterId === params?.id
  );

  // Show loading state
  if (isLoading) {
    return <ProfileSkeleton />;
  }

  // If not own profile and user not found
  if (!isOwnProfile && !user) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Users className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">{t("profile.userNotFound")}</h2>
          <p className="text-muted-foreground">
            {t("profile.profileNotExist")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // If own profile but user not loaded yet
  if (isOwnProfile && !user) {
    return <ProfileSkeleton />;
  }

  // At this point, user is guaranteed to exist
  const displayUser = user!;

  const sharedInterests = currentUser && !isOwnProfile
    ? (displayUser.interests || []).filter((i) => (currentUser.interests || []).includes(i))
    : [];

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Avatar */}
            <div className="relative group">
              <Avatar className="w-32 h-32 border-4 border-background shadow-lg">
                <AvatarImage src={displayUser.avatarUrl || undefined} alt={displayUser.name || ""} />
                <AvatarFallback className="text-3xl font-semibold bg-primary/10 text-primary">
                  {getInitials(displayUser.name || displayUser.email)}
                </AvatarFallback>
              </Avatar>
              {displayUser.isOnline && (
                <span className="absolute bottom-2 right-2 w-5 h-5 bg-green-500 border-3 border-background rounded-full" />
              )}
              {isOwnProfile && (
                <>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition cursor-pointer"
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                    ) : (
                      <Camera className="w-8 h-8 text-white" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-2">
                <h1 className="text-2xl font-bold text-foreground" data-testid="text-profile-name">
                  {displayUser.fullName || displayUser.name}
                </h1>
                {!isOwnProfile && sharedInterests.length > 0 && (
                  <Badge variant="secondary" className="self-center md:self-auto">
                    <Sparkles className="w-3 h-3 mr-1" />
                    {t("discover.match", { 
                      percent: Math.round((sharedInterests.length / (currentUser?.interests?.length || 1)) * 100)
                    })}
                  </Badge>
                )}
              </div>

              {displayUser.jobPosition && (
                <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mb-2">
                  <Briefcase className="w-4 h-4" />
                  <span>{displayUser.jobPosition}</span>
                </div>
              )}

              <div className="flex items-center justify-center md:justify-start gap-2 text-muted-foreground mb-4">
                <Mail className="w-4 h-4" />
                <span>{displayUser.email}</span>
              </div>

              {displayUser.bio && (
                <p className="text-muted-foreground mb-4 max-w-xl">
                  {displayUser.bio}
                </p>
              )}

              {displayUser.seekingDescription && (
                <p className="text-sm text-muted-foreground mb-4 max-w-xl italic">
                  "{displayUser.seekingDescription}"
                </p>
              )}

              {/* Interests */}
              <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                {(displayUser.interests || []).map((interest) => (
                  <Badge
                    key={interest}
                    variant={sharedInterests.includes(interest) ? "default" : "outline"}
                  >
                    {interest}
                  </Badge>
                ))}
                {(!displayUser.interests || displayUser.interests.length === 0) && (
                  <span className="text-sm text-muted-foreground">
                    {t("profile.noInterests")}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-center md:justify-start gap-2">
                {isOwnProfile ? (
                  <Dialog open={isEditing} onOpenChange={setIsEditing}>
                    <DialogTrigger asChild>
                      <Button onClick={handleEditClick} data-testid="button-edit-profile">
                        <Edit2 className="w-4 h-4 mr-2" />
                        {t("profile.editProfile")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{t("profile.editProfile")}</DialogTitle>
                      </DialogHeader>
                      <Form {...form}>
                        <form
                          onSubmit={form.handleSubmit((data) =>
                            updateProfileMutation.mutate(data)
                          )}
                          className="space-y-4"
                        >
                          <FormField
                            control={form.control}
                            name="fullName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("setup.fullName")}</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-profile-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("auth.email")}</FormLabel>
                                <FormControl>
                                  <Input type="email" {...field} disabled className="bg-muted" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="jobPosition"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("setup.jobPosition")}</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder={t("profile.rolePlaceholder")}
                                    {...field}
                                    data-testid="input-profile-role"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="bio"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("profile.bio")}</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder={t("profile.bioPlaceholder")}
                                    className="resize-none"
                                    {...field}
                                    data-testid="input-profile-bio"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="seekingDescription"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t("setup.seekingDescription")}</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder={t("setup.seekingPlaceholder")}
                                    className="resize-none"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div>
                            <FormLabel>{t("profile.interests")}</FormLabel>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {INTEREST_CATEGORIES.map((interest) => (
                                <Badge
                                  key={interest}
                                  variant={
                                    selectedInterests.includes(interest)
                                      ? "default"
                                      : "outline"
                                  }
                                  className="cursor-pointer"
                                  onClick={() => toggleInterest(interest)}
                                  data-testid={`interest-${interest.toLowerCase().replace(/\s+/g, "-")}`}
                                >
                                  {interest}
                                  {selectedInterests.includes(interest) && (
                                    <X className="w-3 h-3 ml-1" />
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-4">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsEditing(false)}
                            >
                              {t("common.cancel")}
                            </Button>
                            <Button
                              type="submit"
                              disabled={updateProfileMutation.isPending}
                              data-testid="button-save-profile"
                            >
                              {updateProfileMutation.isPending
                                ? t("profile.saving")
                                : t("profile.saveChanges")}
                            </Button>
                          </div>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      disabled={connectionStatus !== null}
                      onClick={() => connectMutation.mutate(displayUser.id)}
                      data-testid="button-connect-profile"
                    >
                      {connectionStatus === "accepted" ? (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          {t("common.connected")}
                        </>
                      ) : connectionStatus === "pending" ? (
                        t("profile.requestPending")
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4 mr-2" />
                          {t("common.connect")}
                        </>
                      )}
                    </Button>
                    {connectionStatus === "accepted" && (
                      <Button
                        variant="outline"
                        onClick={() => openChat(displayUser)}
                      >
                        <MessageSquare className="w-4 h-4 mr-2" />
                        {t("common.message")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats for own profile */}
      {isOwnProfile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.connections")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold">
                  {connections?.filter((c) => c.status === "accepted").length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("profile.interests")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold">
                  {(displayUser.interests || []).length}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.pendingRequests")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                <span className="text-2xl font-bold">
                  {connections?.filter((c) => c.status === "pending" && c.receiverId === displayUser.id).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Shared Interests Section */}
      {!isOwnProfile && sharedInterests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              {t("profile.sharedInterests")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {sharedInterests.map((interest) => (
                <Badge key={interest} variant="default">
                  {interest}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              {t("profile.youShare", { 
                name: displayUser.fullName || displayUser.name || "", 
                count: sharedInterests.length 
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Content Tabs - Posts/REALS Selector */}
      <Card>
        <CardContent className="pt-6">
          {/* Tab Selector */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setContentTab('posts')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  contentTab === 'posts'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="w-4 h-4" />
                {t("profile.posts")}
              </button>
              <button
                onClick={() => setContentTab('reals')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  contentTab === 'reals'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Video className="w-4 h-4" />
                REALS
              </button>
            </div>
          </div>

          {/* Posts Content */}
          {contentTab === 'posts' && (
            <>
              {userPosts.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground font-medium">{t("profile.noPosts")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("profile.noPostsDescription")}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {userPosts.map((post) => (
                    <div 
                      key={post.id} 
                      className="flex gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarImage src={post.user.avatarUrl || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(post.user.fullName || post.user.name || "")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-medium text-sm">
                            {post.user.fullName || post.user.name}
                          </p>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatPostDate(post.createdAt)}
                          </span>
                        </div>
                        <Link 
                          href={`/posts?highlight=${post.id}`}
                          className="group"
                        >
                          <p className="text-sm text-muted-foreground group-hover:text-primary transition-colors cursor-pointer">
                            {truncateContent(post.content)}
                            {post.content.split(/\s+/).length > 10 && (
                              <span className="inline-flex items-center ml-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight className="w-3 h-3" />
                              </span>
                            )}
                          </p>
                        </Link>
                        {post.imageUrl && (
                          <div className="mt-2">
                            <img 
                              src={post.imageUrl} 
                              alt="" 
                              className="w-16 h-16 object-cover rounded-lg"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* REALS Content */}
          {contentTab === 'reals' && (
            <>
              {userReals.length === 0 ? (
                <div className="text-center py-8">
                  <Video className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground font-medium">{t("profile.noReals")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("profile.noRealsDescription")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {userReals.map((real) => (
                    <Link key={real.id} href={`/reals?id=${real.id}`}>
                      <div className="group relative aspect-[9/16] rounded-lg overflow-hidden bg-black cursor-pointer">
                        {real.thumbnailUrl ? (
                          <img
                            src={real.thumbnailUrl}
                            alt={real.title || ""}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <video
                            src={real.videoUrl}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                          />
                        )}
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                          <Play className="w-8 h-8 text-white opacity-80 group-hover:opacity-100 transition-opacity" />
                        </div>
                        {real.title && (
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-xs text-white truncate font-medium drop-shadow-lg">
                              {real.title}
                            </p>
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
