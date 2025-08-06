"use client";

import { CheckCircle, Clock, Coffee } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getAllDrinksForMenu, type MenuItem } from "~/server/actions/menu";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export default function DrinksMenu() {
  const [drinks, setDrinks] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // Sort drinks: available first, then unavailable
  const sortedDrinks = [...drinks].sort((a, b) => {
    // Available drinks come first (true > false)
    if (a.isCurrentlyAvailable && !b.isCurrentlyAvailable) return -1;
    if (!a.isCurrentlyAvailable && b.isCurrentlyAvailable) return 1;
    // Within same availability, sort by name
    return a.name.localeCompare(b.name);
  });

  // Group drinks by availability for section headers
  const availableDrinks = drinks.filter((drink) => drink.isCurrentlyAvailable);
  const unavailableDrinks = drinks.filter(
    (drink) => !drink.isCurrentlyAvailable
  );

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Coffee className="h-6 w-6 animate-pulse" />
            <div>Getränkekarte wird geladen...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <h1 className="text-4xl font-bold tracking-tight">
            Unsere Getränkekarte
          </h1>
        </div>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Entdecken Sie die eiskalten kühlgestellten Getränke des
          Getränkewartes.
        </p>
      </div>

      {/* Drinks Grid - Available First */}
      {sortedDrinks.length === 0 ? (
        <div className="text-center py-12">
          <Coffee className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            Keine Getränke verfügbar
          </h3>
          <p className="text-muted-foreground">
            Unsere Getränkekarte wird bald aktualisiert.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Available Drinks Section */}
          {availableDrinks.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <h2 className="text-2xl font-bold">Verfügbare Getränke</h2>
                <Badge variant="secondary">{availableDrinks.length}</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {availableDrinks.map((drink) => (
                  <Card
                    key={drink.id}
                    className="group hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
                  >
                    <CardHeader className="pb-0">
                      <div className="relative w-full h-32 sm:h-40 md:h-48">
                        <Image
                          src={drink.picture || "/placeholder.svg"}
                          alt={drink.name}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                          className="rounded-md object-cover"
                        />
                        {/* Availability Badge Overlay */}
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-green-500 hover:bg-green-600 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            <span className="hidden sm:inline">Verfügbar</span>
                          </Badge>
                        </div>
                      </div>

                      <CardTitle className="text-sm sm:text-base lg:text-lg group-hover:text-primary transition-colors line-clamp-2">
                        {drink.name}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <div className="flex flex-col">
                        <div className="text-lg sm:text-xl lg:text-2xl font-bold text-primary">
                          €{drink.price.toFixed(2)}
                        </div>

                        <Button
                          size="sm"
                          className="bg-green-500 hover:bg-green-600 text-white w-full text-xs sm:text-sm"
                        >
                          Bestellen
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Unavailable Drinks Section */}
          {unavailableDrinks.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-orange-500" />
                <h2 className="text-2xl font-bold">Derzeit nicht verfügbar</h2>
                <Badge variant="secondary">{unavailableDrinks.length}</Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {unavailableDrinks.map((drink) => (
                  <Card key={drink.id} className="opacity-75 bg-muted/30">
                    <CardHeader>
                      <div className="relative w-full h-32 sm:h-40 md:h-48">
                        <Image
                          src={drink.picture || "/placeholder.svg"}
                          alt={drink.name}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                          className="rounded-md object-cover grayscale"
                        />
                        {/* Availability Badge Overlay */}
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-orange-500 text-white text-xs">
                            <Clock className="h-3 w-3 mr-1" />
                            <span className="hidden sm:inline">
                              Nicht verfügbar
                            </span>
                          </Badge>
                        </div>
                      </div>

                      <CardTitle className="text-sm sm:text-base lg:text-lg line-clamp-2">
                        {drink.name}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <div className="flex flex-col gap-2">
                        <div className="text-lg sm:text-xl lg:text-2xl font-bold text-muted-foreground">
                          €{drink.price.toFixed(2)}
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className="cursor-not-allowed w-full text-xs sm:text-sm"
                        >
                          Nicht verfügbar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-12 text-center space-y-4 border-t pt-8">
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>"Man muss gewinnen, was man gewinnen will"</span>
        </div>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-orange-500" />
          <span>Die Verfügbarkeit kann sich kurzfristig ändern</span>
        </div>
      </div>
    </div>
  );
}
