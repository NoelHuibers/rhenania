"use client";

import { CheckCircle, Clock } from "lucide-react";
import Image from "next/image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type MenuItem } from "~/server/actions/menu";

interface DrinkCardProps {
  drink: MenuItem;
  onOrderClick: (drink: MenuItem) => void;
}

export function PartyDrinkCard({ drink, onOrderClick }: DrinkCardProps) {
  const isAvailable = drink.isCurrentlyAvailable;

  return (
    <Card
      className={`${
        isAvailable
          ? "group hover:shadow-lg transition-all duration-200 hover:scale-[1.02]"
          : "opacity-75 bg-muted/30"
      }`}
    >
      <CardHeader className={isAvailable ? "pb-0" : ""}>
        <div className="relative w-full h-32 sm:h-40 md:h-48">
          <Image
            src={drink.picture || "/placeholder.svg"}
            alt={drink.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
            className={`rounded-md object-cover ${
              !isAvailable ? "grayscale" : ""
            }`}
          />

          {/* Availability Badge Overlay */}
          <div className="absolute top-2 right-2">
            {isAvailable ? (
              <Badge className="bg-green-500 hover:bg-green-600 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Verfügbar</span>
              </Badge>
            ) : (
              <Badge className="bg-orange-500 text-white text-xs">
                <Clock className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Nicht verfügbar</span>
              </Badge>
            )}
          </div>
        </div>

        <CardTitle
          className={`text-sm sm:text-base lg:text-lg line-clamp-2 ${
            isAvailable ? "group-hover:text-primary transition-colors" : ""
          }`}
        >
          {drink.name}
        </CardTitle>
      </CardHeader>

      <CardContent className={isAvailable ? "pt-0" : "pt-0"}>
        <div className="flex flex-col gap-2">
          {isAvailable ? (
            <Button
              size="sm"
              onClick={() => onOrderClick(drink)}
              className="bg-green-500 hover:bg-green-600 text-white w-full text-xs sm:text-sm"
            >
              Bestellen
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="cursor-not-allowed w-full text-xs sm:text-sm"
            >
              Nicht verfügbar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
