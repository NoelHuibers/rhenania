// components/drinks/DrinksGrid.tsx
import { type MenuItem } from "~/server/actions/menu";
import { DrinkCard } from "./DrinkCard";

interface DrinksGridProps {
  drinks: MenuItem[];
  onOrderClick: (drink: MenuItem) => void;
}

export function DrinksGrid({ drinks, onOrderClick }: DrinksGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {drinks.map((drink) => (
        <DrinkCard key={drink.id} drink={drink} onOrderClick={onOrderClick} />
      ))}
    </div>
  );
}
