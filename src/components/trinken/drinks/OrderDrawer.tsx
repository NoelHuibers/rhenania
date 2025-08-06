// components/drinks/OrderDrawer.tsx
"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { type MenuItem } from "~/server/actions/menu";

interface OrderDrawerProps {
  drink: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (drink: MenuItem, quantity: number) => void;
}

export function OrderDrawer({
  drink,
  isOpen,
  onClose,
  onConfirm,
}: OrderDrawerProps) {
  const [quantity, setQuantity] = useState(1);

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1) {
      setQuantity(num);
    }
  };

  const adjustQuantity = (delta: number) => {
    const newQuantity = Math.max(1, quantity + delta);
    setQuantity(newQuantity);
  };

  const setPresetQuantity = (preset: number) => {
    setQuantity(preset);
  };

  const handleConfirm = () => {
    if (drink) {
      onConfirm(drink, quantity);
      onClose();
      setQuantity(1); // Reset quantity
    }
  };

  const handleClose = () => {
    onClose();
    setQuantity(1); // Reset quantity
  };

  if (!drink) return null;

  const totalPrice = drink.price * quantity;

  return (
    <Drawer open={isOpen} onOpenChange={handleClose}>
      <DrawerContent>
        <DrawerHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="relative w-24 h-24">
              <Image
                src={drink.picture || "/placeholder.svg"}
                alt={drink.name}
                fill
                className="rounded-lg object-cover"
              />
            </div>
          </div>
          <DrawerTitle className="text-xl font-bold">{drink.name}</DrawerTitle>
          <DrawerDescription className="flex items-center justify-center gap-2">
            <Badge className="bg-green-500 text-white">Verfügbar</Badge>
            <span>€{drink.price.toFixed(2)} pro Stück</span>
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-6 space-y-6">
          {/* Quantity Controls */}
          <div className="space-y-4">
            {/* Manual Input with +/- buttons */}
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => adjustQuantity(-1)}
                disabled={quantity <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>

              <Input
                type="number"
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="w-20 text-center font-bold text-lg"
                min="1"
              />

              <Button
                variant="outline"
                size="icon"
                onClick={() => adjustQuantity(1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Preset Buttons */}
            <div className="flex justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setPresetQuantity(2)}
                className="px-6"
              >
                BJ
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPresetQuantity(20)}
                className="px-6"
              >
                K
              </Button>
            </div>
          </div>

          {/* Price Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>
                {quantity}x {drink.name}
              </span>
              <span>€{totalPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Gesamt</span>
              <span className="text-primary">€{totalPrice.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <DrawerFooter className="flex flex-row gap-3">
          <Button variant="outline" onClick={handleClose} className="flex-1">
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-green-500 hover:bg-green-600"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Bestätigen
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
