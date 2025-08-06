"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

interface Drink {
  id: string;
  name: string;
  price: number;
  image: string;
  description: string;
}

interface OrderItem {
  drink: Drink;
  quantity: number;
}

const drinks: Drink[] = [
  {
    id: "1",
    name: "Espresso",
    price: 2.5,
    image: "/espresso-coffee-cup.png",
    description: "Rich and bold espresso shot",
  },
  {
    id: "2",
    name: "Cappuccino",
    price: 4.0,
    image: "/placeholder-290hb.png",
    description: "Creamy cappuccino with steamed milk",
  },
  {
    id: "3",
    name: "Latte",
    price: 4.5,
    image: "/placeholder-drj38.png",
    description: "Smooth latte with velvety milk",
  },
  {
    id: "4",
    name: "Americano",
    price: 3.0,
    image: "/placeholder-3xhn3.png",
    description: "Classic black coffee",
  },
  {
    id: "5",
    name: "Mocha",
    price: 5.0,
    image: "/placeholder-rb3o3.png",
    description: "Coffee with rich chocolate",
  },
  {
    id: "6",
    name: "Green Tea",
    price: 3.5,
    image: "/green-tea-in-cup.png",
    description: "Fresh brewed green tea",
  },
];

export default function DrinkOrderApp() {
  const [order, setOrder] = useState<OrderItem[]>([]);

  const updateQuantity = (drinkId: string, newQuantity: number) => {
    if (newQuantity === 0) {
      setOrder(order.filter((item) => item.drink.id !== drinkId));
      return;
    }

    const existingItem = order.find((item) => item.drink.id === drinkId);

    if (existingItem) {
      setOrder(
        order.map((item) =>
          item.drink.id === drinkId ? { ...item, quantity: newQuantity } : item
        )
      );
    } else {
      const drink = drinks.find((d) => d.id === drinkId);
      if (drink) {
        setOrder([...order, { drink, quantity: newQuantity }]);
      }
    }
  };

  const getQuantity = (drinkId: string): number => {
    const item = order.find((item) => item.drink.id === drinkId);
    return item ? item.quantity : 0;
  };

  const getTotalCost = (): number => {
    return order.reduce(
      (total, item) => total + item.drink.price * item.quantity,
      0
    );
  };

  const getTotalItems = (): number => {
    return order.reduce((total, item) => total + item.quantity, 0);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-bold text-center">Drink Menu</h1>
          <p className="text-gray-600 text-center text-sm mt-1">
            Select your favorite drinks
          </p>
        </div>
      </div>

      {/* Drinks Grid */}
      <div className="px-4 py-6">
        <div className="grid grid-cols-2 gap-3 max-w-4xl mx-auto">
          {drinks.map((drink) => {
            const quantity = getQuantity(drink.id);
            return (
              <Card key={drink.id} className="overflow-hidden">
                <CardHeader className="p-0">
                  <div className="relative">
                    <Image
                      src={drink.image || "/placeholder.svg"}
                      alt={drink.name}
                      width={200}
                      height={200}
                      className="w-full h-32 sm:h-48 object-cover"
                    />
                    {quantity > 0 && (
                      <Badge className="absolute top-2 right-2 bg-green-600">
                        {quantity}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  <CardTitle className="text-base sm:text-lg mb-1">
                    {drink.name}
                  </CardTitle>
                  <p className="text-gray-600 text-xs sm:text-sm mb-2 line-clamp-2">
                    {drink.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-lg sm:text-xl font-bold text-green-600">
                      ${drink.price.toFixed(2)}
                    </span>
                    {quantity > 0 && (
                      <span className="text-xs sm:text-sm text-gray-500">
                        Total: ${(drink.price * quantity).toFixed(2)}
                      </span>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="p-3 pt-0">
                  <div className="flex items-center justify-center w-full gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() =>
                        updateQuantity(drink.id, Math.max(0, quantity - 1))
                      }
                      disabled={quantity === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => {
                        const newQuantity = Math.max(
                          0,
                          parseInt(e.target.value) || 0
                        );
                        updateQuantity(drink.id, newQuantity);
                      }}
                      className="w-12 h-8 text-center text-sm border rounded px-1"
                      min="0"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => updateQuantity(drink.id, quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs font-bold"
                      onClick={() => updateQuantity(drink.id, quantity + 20)}
                    >
                      K
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Order Summary - Fixed Bottom */}
      {order.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
          <div className="px-4 py-4">
            <div className="max-w-4xl mx-auto">
              {/* Order Items */}
              <div className="mb-4 max-h-32 overflow-y-auto">
                {order.map((item) => (
                  <div
                    key={item.drink.id}
                    className="flex justify-between items-center py-1"
                  >
                    <span className="text-sm">
                      {item.quantity}x {item.drink.name}
                    </span>
                    <span className="text-sm font-medium">
                      ${(item.drink.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <Separator className="mb-4" />

              {/* Total */}
              <div className="flex justify-between items-center mb-4">
                <div>
                  <span className="text-lg font-bold">Total</span>
                  <span className="text-sm text-gray-600 ml-2">
                    ({getTotalItems()} items)
                  </span>
                </div>
                <span className="text-2xl font-bold text-green-600">
                  ${getTotalCost().toFixed(2)}
                </span>
              </div>

              {/* Pay Button */}
              <Button className="w-full h-12 text-lg font-semibold" size="lg">
                <ShoppingCart className="mr-2 h-5 w-5" />
                Pay Now - ${getTotalCost().toFixed(2)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Padding when order exists */}
      {order.length > 0 && <div className="h-64" />}
    </div>
  );
}
