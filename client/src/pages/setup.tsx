import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { INTEREST_CATEGORIES } from "@shared/schema";
import { Loader2, Upload, X, Camera, Handshake } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SetupPage() {
  const { t } = useI18n();
  const { user, refetchUser, isAuthenticated, profileCompleted, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [fullName, setFullName] = useState("");
  const [jobPosition, setJobPosition] = useState("");
  const [bio, setBio] = useState("");
  const [seekingDescription, setSeekingDescription] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize form values when user data is available
  useEffect(() => {
    if (user && !isInitialized) {
      setFullName(user.fullName || user.name || "");
      setJobPosition(user.jobPosition || "");
      setBio(user.bio || "");
      setSeekingDescription(user.seekingDescription || "");
      setSelectedInterests(user.interests || []);
      setAvatarPreview(user.avatarUrl || null);
      setIsInitialized(true);
    }
  }, [user, isInitialized]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Redirect if profile already completed
  useEffect(() => {
    if (!isLoading && isAuthenticated && profileCompleted) {
      navigate("/");
    }
  }, [isLoading, isAuthenticated, profileCompleted, navigate]);

  const setupMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Setup failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({
        title: t("setup.profileCompleted"),
      });
      // Invalidate all queries and refetch user
      await queryClient.invalidateQueries();
      await refetchUser();
      // Small delay to ensure state is updated
      setTimeout(() => {
        window.location.href = "/";
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: t("setup.setupError"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: t("errors.uploadFailed"),
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t("errors.uploadFailed"),
        description: "File size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    setAvatarFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload immediately
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
      
      const data = await res.json();
      setAvatarPreview(data.avatarUrl);
      toast({
        title: "Profile picture uploaded",
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

  const removeAvatar = async () => {
    try {
      await fetch("/api/upload/profile-picture", {
        method: "DELETE",
        credentials: "include",
      });
      setAvatarPreview(null);
      setAvatarFile(null);
    } catch (error) {
      console.error("Failed to remove avatar:", error);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        title: "Full name is required",
        variant: "destructive",
      });
      return;
    }

    if (!jobPosition.trim()) {
      toast({
        title: "Job position is required",
        variant: "destructive",
      });
      return;
    }

    if (selectedInterests.length === 0) {
      toast({
        title: t("setup.minInterests"),
        variant: "destructive",
      });
      return;
    }

    setupMutation.mutate({
      fullName: fullName.trim(),
      jobPosition: jobPosition.trim(),
      bio: bio.trim(),
      seekingDescription: seekingDescription.trim(),
      interests: selectedInterests,
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Don't render if not authenticated or already completed
  if (!isAuthenticated || profileCompleted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary flex items-center justify-center">
            <Handshake className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-2">{t("setup.title")}</h1>
          <p className="text-muted-foreground">{t("setup.subtitle")}</p>
        </div>

        <Card className="shadow-xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Profile Picture */}
              <div className="flex flex-col items-center gap-4">
                <Label className="text-base font-medium">{t("setup.profilePicture")}</Label>
                <div className="relative">
                  <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
                    <AvatarImage src={avatarPreview || undefined} />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                      {fullName ? getInitials(fullName) : "?"}
                    </AvatarFallback>
                  </Avatar>
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {avatarPreview ? t("setup.changePicture") : t("setup.uploadPicture")}
                  </Button>
                  {avatarPreview && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeAvatar}
                      disabled={isUploading}
                    >
                      <X className="w-4 h-4 mr-1" />
                      {t("setup.removePicture")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-2">
                <Label htmlFor="fullName">{t("setup.fullName")} *</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={t("setup.fullNamePlaceholder")}
                  required
                />
              </div>

              {/* Email (Read-only) */}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  value={user?.email || ""}
                  disabled
                  className="bg-muted"
                />
              </div>

              {/* Job Position */}
              <div className="space-y-2">
                <Label htmlFor="jobPosition">{t("setup.jobPosition")} *</Label>
                <Input
                  id="jobPosition"
                  value={jobPosition}
                  onChange={(e) => setJobPosition(e.target.value)}
                  placeholder={t("setup.jobPositionPlaceholder")}
                  required
                />
              </div>

              {/* Interests */}
              <div className="space-y-3">
                <Label>{t("setup.interests")} *</Label>
                <p className="text-sm text-muted-foreground">{t("setup.interestsDescription")}</p>
                <div className="flex flex-wrap gap-2">
                  {INTEREST_CATEGORIES.map((interest) => (
                    <Badge
                      key={interest}
                      variant={selectedInterests.includes(interest) ? "default" : "outline"}
                      className="cursor-pointer text-sm py-1.5 px-3 hover:bg-primary/80 transition-colors"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                      {selectedInterests.includes(interest) && (
                        <X className="w-3 h-3 ml-1" />
                      )}
                    </Badge>
                  ))}
                </div>
                {selectedInterests.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {selectedInterests.length} selected
                  </p>
                )}
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio">{t("setup.bio")}</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t("setup.bioPlaceholder")}
                  rows={3}
                />
              </div>

              {/* Seeking Description */}
              <div className="space-y-2">
                <Label htmlFor="seeking">{t("setup.seekingDescription")}</Label>
                <Textarea
                  id="seeking"
                  value={seekingDescription}
                  onChange={(e) => setSeekingDescription(e.target.value)}
                  placeholder={t("setup.seekingPlaceholder")}
                  rows={2}
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={setupMutation.isPending || selectedInterests.length === 0}
              >
                {setupMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  t("setup.completeSetup")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
