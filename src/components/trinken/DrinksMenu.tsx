"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getAllDrinksForMenu, type MenuItem } from "~/server/actions/menu";

import { DrinksSection } from "./drinks/DrinksSection";
import { EmptyState } from "./drinks/EmptyState";
import { LoadingState } from "./drinks/Loadingstate";
import { MenuFooter } from "./drinks/MenuFooter";
import { MenuHeader } from "./drinks/MenuHeader";
import { OrderDrawer } from "./drinks/OrderDrawer";

export default function DrinksMenu() {
  const [drinks, setDrinks] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDrink, setSelectedDrink] = useState<MenuItem | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Load drinks on component mount
  useEffect(() => {
    loadDrinks();
  }, []);

  const loadDrinks = async () => {
    try {
      setIsLoading(true);
      const fetchedDrinks = await getAllDrinksForMenu();
      setDrinks(fetchedDrinks);
    } catch (error) {
      console.error("Error loading drinks:", error);
      toast.error("Fehler beim Laden der Getränkekarte");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOrderClick = (drink: MenuItem) => {
    setSelectedDrink(drink);
    setIsDrawerOpen(true);
  };

  const handleDrawerClose = () => {
    setIsDrawerOpen(false);
    setSelectedDrink(null);
  };

  // Group drinks by availability
  const availableDrinks = drinks.filter((drink) => drink.isCurrentlyAvailable);
  const unavailableDrinks = drinks.filter(
    (drink) => !drink.isCurrentlyAvailable
  );

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <>
      <div className="container mx-auto p-6 space-y-8">
        <MenuHeader />

        {drinks.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {availableDrinks.length > 0 && (
              <DrinksSection
                title="Verfügbare Getränke"
                drinks={availableDrinks}
                icon="available"
                onOrderClick={handleOrderClick}
              />
            )}

            {unavailableDrinks.length > 0 && (
              <DrinksSection
                title="Derzeit nicht verfügbar"
                drinks={unavailableDrinks}
                icon="unavailable"
                onOrderClick={handleOrderClick}
              />
            )}
          </div>
        )}

        <MenuFooter />
      </div>

      <OrderDrawer
        drink={selectedDrink}
        isOpen={isDrawerOpen}
        onClose={handleDrawerClose}
      />
    </>
  );
}
