import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import en from "@/locales/en.json";
import hu from "@/locales/hu.json";
import de from "@/locales/de.json";

export type SupportedLanguage = "en" | "hu" | "de";

const translations: Record<SupportedLanguage, typeof en> = {
  en,
  hu,
  de,
};

const LANGUAGE_STORAGE_KEY = "llc_language";

interface I18nContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | null>(null);

// Detect browser language
function detectBrowserLanguage(): SupportedLanguage {
  const browserLang = navigator.language.split("-")[0].toLowerCase();
  if (browserLang === "hu") return "hu";
  if (browserLang === "de") return "de";
  return "en"; // Default to English if not supported
}

// Get initial language from storage or browser
function getInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && ["en", "hu", "de"].includes(stored)) {
    return stored as SupportedLanguage;
  }
  return detectBrowserLanguage();
}

// Get nested value from object using dot notation
function getNestedValue(obj: any, path: string): string | undefined {
  return path.split(".").reduce((current, key) => {
    return current && typeof current === "object" ? current[key] : undefined;
  }, obj);
}

// Interpolate parameters in translation string
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return params[key]?.toString() ?? `{{${key}}}`;
  });
}

interface I18nProviderProps {
  children: ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguageState] = useState<SupportedLanguage>(getInitialLanguage);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, []);

  // Set document language on initial load
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const translation = getNestedValue(translations[language], key);
      if (translation === undefined) {
        // Fallback to English
        const fallback = getNestedValue(translations.en, key);
        if (fallback === undefined) {
          console.warn(`Translation missing for key: ${key}`);
          return key;
        }
        return interpolate(fallback, params);
      }
      return interpolate(translation, params);
    },
    [language]
  );

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

// Export language names for the switcher
export const languageNames: Record<SupportedLanguage, string> = {
  en: "English",
  hu: "Magyar",
  de: "Deutsch",
};

// Export language flags (emoji)
export const languageFlags: Record<SupportedLanguage, string> = {
  en: "🇬🇧",
  hu: "🇭🇺",
  de: "🇩🇪",
};


