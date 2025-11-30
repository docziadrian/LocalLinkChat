import { useState, useRef, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  MessageSquare, 
  X, 
  Minus, 
  Send, 
  Headphones,
  Bot,
  Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SupportMessage {
  id: string;
  content: string;
  isSupport: boolean;
  timestamp: string;
}

interface LiveChatProps {
  messages?: any[];
  onSendMessage?: (content: string) => void;
  isConnected?: boolean;
  currentUserId?: string;
  currentUserName?: string;
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function LiveChat({
  currentUserName,
}: LiveChatProps) {
  const { t, language } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [supportMessages, isOpen, isMinimized]);

  // Add welcome message when chat opens
  useEffect(() => {
    if (isOpen && supportMessages.length === 0) {
      setSupportMessages([{
        id: "welcome",
        content: t("chat.supportWelcome"),
        isSupport: true,
        timestamp: new Date().toISOString()
      }]);
    }
  }, [isOpen, t]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: SupportMessage = {
      id: `user-${Date.now()}`,
      content: inputValue.trim(),
      isSupport: false,
      timestamp: new Date().toISOString()
    };

    setSupportMessages(prev => [...prev, userMessage]);
    const messageText = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ 
          message: messageText,
          language 
        })
      });

      const data = await response.json();
      
      const aiMessage: SupportMessage = {
        id: `ai-${Date.now()}`,
        content: data.response || t("errors.general"),
        isSupport: true,
        timestamp: new Date().toISOString()
      };

      setSupportMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      const errorMessage: SupportMessage = {
        id: `error-${Date.now()}`,
        content: t("errors.general"),
        isSupport: true,
        timestamp: new Date().toISOString()
      };
      setSupportMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Chat button when closed
  if (!isOpen) {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Button
          onClick={() => setIsOpen(true)}
          size="lg"
          className="rounded-full w-14 h-14 shadow-lg hover:shadow-xl transition-shadow"
        >
          <Headphones className="w-6 h-6" />
        </Button>
      </motion.div>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-6 right-6 z-50"
      >
        <Card
          onClick={() => setIsMinimized(false)}
          className="p-3 cursor-pointer hover:bg-accent transition-colors shadow-lg"
        >
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background bg-green-500" />
            </div>
            <div>
              <p className="font-medium text-sm">{t("chat.aiAssistant")}</p>
              <p className="text-xs text-muted-foreground">
                {t("common.online")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-8 w-8"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                setIsMinimized(false);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  // Full chat window
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className="fixed bottom-6 right-6 z-50 w-80 sm:w-96"
    >
      <Card className="flex flex-col h-[450px] sm:h-[500px] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b bg-primary text-primary-foreground rounded-t-lg">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-primary bg-green-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{t("chat.liveSupport")}</p>
            <div className="flex items-center gap-1 text-xs text-primary-foreground/80">
              <Bot className="w-3 h-3" />
              {t("chat.aiAssistant")}
            </div>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => setIsMinimized(true)}
            >
              <Minus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-primary-foreground hover:bg-primary-foreground/20"
              onClick={() => {
                setIsOpen(false);
                setIsMinimized(false);
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {supportMessages.length === 0 && (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  {t("chat.startConversation")}
                </p>
              </div>
            )}
            {supportMessages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.isSupport ? "justify-start" : "justify-end"
                }`}
              >
                <div className="flex gap-2 max-w-[85%]">
                  {message.isSupport && (
                    <Avatar className="w-8 h-8 flex-shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                        <Bot className="w-4 h-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={`px-4 py-2 rounded-2xl ${
                      message.isSupport
                        ? "bg-muted rounded-bl-md"
                        : "bg-primary text-primary-foreground rounded-br-md"
                    }`}
                  >
                    {message.isSupport && (
                      <p className="text-xs font-medium mb-1 text-muted-foreground">
                        {t("chat.aiAssistant")}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-[10px] opacity-70 mt-1">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex gap-2 max-w-[85%]">
                  <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="px-4 py-2 rounded-2xl bg-muted rounded-bl-md">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">
                        {t("chat.sending")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chat.typeYourMessage")}
              disabled={isLoading}
              className="flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
