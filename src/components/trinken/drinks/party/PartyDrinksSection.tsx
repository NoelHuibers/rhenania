// components/drinks/DrinksSection.tsx
import { CheckCircle, Clock } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { type MenuItem } from "~/server/actions/menu";
import { PartyDrinksGrid } from "./PartyDrinksGrid";

interface DrinksSectionProps {
  title: string;
  drinks: MenuItem[];
  icon: "available" | "unavailable";
  onOrderClick: (drink: MenuItem) => void;
}

export function PartyDrinksSection({
  title,
  drinks,
  icon,
  onOrderClick,
}: DrinksSectionProps) {
  const IconComponent = icon === "available" ? CheckCircle : Clock;
  const iconColor = icon === "available" ? "text-green-500" : "text-orange-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <IconComponent className={`h-6 w-6 ${iconColor}`} />
        <h2 className="text-2xl font-bold">{title}</h2>
        <Badge variant="secondary">{drinks.length}</Badge>
      </div>

      <PartyDrinksGrid drinks={drinks} onOrderClick={onOrderClick} />
    </div>
  );
}
