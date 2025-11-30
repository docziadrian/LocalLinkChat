import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useI18n } from "@/lib/i18n";
import { X } from "lucide-react";
import { INTEREST_CATEGORIES } from "@shared/schema";

interface InterestFilterProps {
  selectedInterests: string[];
  onToggleInterest: (interest: string) => void;
  onClearAll: () => void;
}

export function InterestFilter({
  selectedInterests,
  onToggleInterest,
  onClearAll,
}: InterestFilterProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-medium text-sm text-foreground">
          {t("setup.selectInterests")}
        </h3>
        {selectedInterests.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-8 text-xs text-muted-foreground"
            data-testid="button-clear-filters"
          >
            <X className="h-3 w-3 mr-1" />
            {t("discover.clearFilters")}
          </Button>
        )}
      </div>

      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex flex-wrap gap-2 pb-2">
          {INTEREST_CATEGORIES.map((interest) => {
            const isSelected = selectedInterests.includes(interest);
            return (
              <Badge
                key={interest}
                variant={isSelected ? "default" : "outline"}
                className="cursor-pointer toggle-elevate"
                onClick={() => onToggleInterest(interest)}
                data-testid={`filter-interest-${interest.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {interest}
                {isSelected && (
                  <X className="h-3 w-3 ml-1" />
                )}
              </Badge>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {selectedInterests.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selectedInterests.length} {t("profile.interests").toLowerCase()} selected
        </p>
      )}
    </div>
  );
}
