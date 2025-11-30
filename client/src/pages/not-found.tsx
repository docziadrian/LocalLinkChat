import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="text-8xl font-bold text-muted-foreground/30 mb-4">
            404
          </div>
          <h1 className="text-2xl font-bold mb-2">{t("errors.notFound")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("errors.notFoundDescription")}
          </p>
          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={() => window.history.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t("errors.goBack")}
            </Button>
            <Link href="/">
              <Button>
                <Home className="w-4 h-4 mr-2" />
                {t("errors.goHome")}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
