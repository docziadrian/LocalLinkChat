import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useI18n, languageNames, languageFlags, type SupportedLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Handshake, Mail, Loader2, CheckCircle, Globe, ChevronDown } from "lucide-react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          renderButton: (element: HTMLElement, config: any) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { t, language, setLanguage } = useI18n();
  const { login, loginWithGoogle, isAuthenticated, profileCompleted } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for auth errors in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorType = params.get("error");
    if (errorType) {
      switch (errorType) {
        case "invalid_link":
        case "invalid_or_expired_link":
          setError(t("auth.invalidLink"));
          break;
        case "link_expired":
          setError(t("auth.linkExpired"));
          break;
        case "verification_failed":
          setError(t("auth.verificationFailed"));
          break;
      }
      // Clean URL
      window.history.replaceState({}, "", "/login");
    }
  }, [t]);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      if (profileCompleted) {
        navigate("/");
      } else {
        navigate("/setup");
      }
    }
  }, [isAuthenticated, profileCompleted, navigate]);

  // Initialize Google Sign-In
  useEffect(() => {
    let scriptElement: HTMLScriptElement | null = null;
    
    // Fetch Google Client ID from server at runtime
    fetch("/api/config")
      .then((res) => res.json())
      .then((config) => {
        if (!config.googleClientId) {
          console.warn("Google Client ID not configured");
          return;
        }

        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
        scriptElement = script;

        script.onload = () => {
          if (window.google) {
            window.google.accounts.id.initialize({
              client_id: config.googleClientId,
              callback: handleGoogleResponse,
            });
            
            const buttonDiv = document.getElementById("google-signin-button");
            if (buttonDiv) {
              window.google.accounts.id.renderButton(buttonDiv, {
                theme: "outline",
                size: "large",
                width: "100%",
                text: "continue_with",
              });
            }
          }
        };
      })
      .catch((err) => {
        console.error("Failed to fetch config:", err);
      });

    return () => {
      if (scriptElement && document.body.contains(scriptElement)) {
        document.body.removeChild(scriptElement);
      }
    };
  }, []);

  const handleGoogleResponse = async (response: any) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await loginWithGoogle(response.credential);
      if (result.success) {
        // Use window.location for a clean navigation that ensures fresh auth state
        // This prevents the race condition where the router catches the navigation
        // before React Query has updated the auth state
        const targetPath = result.profileCompleted ? "/" : "/setup";
        window.location.href = targetPath;
      } else {
        setError(t("auth.magicLinkError"));
        setIsLoading(false);
      }
    } catch (err) {
      setError(t("errors.general"));
      setIsLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await login(email.trim());
      if (result.success) {
        setMagicLinkSent(true);
      } else {
        setError(result.message || t("auth.magicLinkError"));
      }
    } catch (err) {
      setError(t("errors.general"));
    } finally {
      setIsLoading(false);
    }
  };

  if (magicLinkSent) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
        <div className="flex-1 flex items-center justify-center">
          <Card className="w-full max-w-md shadow-xl">
            <CardContent className="pt-8 pb-8 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{t("auth.magicLinkSent")}</h2>
              <p className="text-muted-foreground mb-6">
                {t("auth.magicLinkSentDescription")}
              </p>
              <p className="text-sm text-muted-foreground">
                {email}
              </p>
              <Button
                variant="ghost"
                className="mt-6"
                onClick={() => {
                  setMagicLinkSent(false);
                  setEmail("");
                }}
              >
                {t("common.back")}
              </Button>
            </CardContent>
          </Card>
        </div>
        
        {/* Language Switcher at bottom */}
        <div className="flex justify-center pb-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Globe className="w-4 h-4" />
                <span>{languageFlags[language]} {languageNames[language]}</span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 p-4">
      <div className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-primary flex items-center justify-center">
              <Handshake className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">{t("auth.welcomeTitle")}</CardTitle>
            <CardDescription className="mt-2">
              {t("auth.welcomeSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm text-center">
                {error}
              </div>
            )}

            {/* Google Sign-In */}
            <div id="google-signin-button" className="w-full flex justify-center" />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  {t("common.or")}
                </span>
              </div>
            </div>

            {/* Email Magic Link */}
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder={t("auth.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !email.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t("common.loading")}
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    {t("auth.continueWithEmail")}
                  </>
                )}
              </Button>
            </form>

            <p className="text-xs text-center text-muted-foreground">
              {t("auth.termsNotice")}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Language Switcher at bottom */}
      <div className="flex justify-center pb-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Globe className="w-4 h-4" />
              <span>{languageFlags[language]} {languageNames[language]}</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
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
      </div>
    </div>
  );
}
