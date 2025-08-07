// components/drinks/OrderDrawer.tsx
"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { NumericInput } from "~/components/NumericInput";
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
import { type MenuItem } from "~/server/actions/menu";
import { createOrder } from "~/server/actions/orders";

interface OrderDrawerProps {
  drink: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrderDrawer({ drink, isOpen, onClose }: OrderDrawerProps) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();

  const handleQuantityChange = (value: number) => {
    if (!isNaN(value) && value >= 1) {
      setQuantity(value);
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
    if (!drink) return;

    startTransition(async () => {
      try {
        const orderResult = await createOrder({
          drinkId: drink.id,
          drinkName: drink.name,
          amount: quantity,
          pricePerUnit: drink.price,
          total: drink.price * quantity,
        });

        if (orderResult.success) {
          toast.success(
            `${quantity}x ${drink.name} bestellt (€${(
              drink.price * quantity
            ).toFixed(2)})`
          );
          // Call the original onConfirm if provided (for backward compatibility)

          handleClose();
        } else {
          toast.error(orderResult.error || "Ein Fehler ist aufgetreten.");
        }
      } catch (error) {
        console.error("Order error:", error);
        toast.error("Ein unerwarteter Fehler ist aufgetreten.");
      }
    });
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
                disabled={quantity <= 1 || isPending}
              >
                <Minus className="h-4 w-4" />
              </Button>

              <NumericInput
                value={quantity}
                onChange={handleQuantityChange}
                className="w-20 text-center font-bold text-lg"
                min={1}
                disabled={isPending}
                max={200}
              />

              <Button
                variant="outline"
                size="icon"
                onClick={() => adjustQuantity(1)}
                disabled={isPending}
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
                disabled={isPending}
              >
                BJ
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPresetQuantity(drink.kastengroesse ?? 20)}
                className="px-6"
                disabled={isPending}
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
          <Button
            variant="outline"
            onClick={handleClose}
            className="flex-1"
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleConfirm}
            className="flex-1 bg-green-500 hover:bg-green-600"
            disabled={isPending}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {isPending ? "Bestelle..." : "Bestätigen"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
