"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
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
import { createGame } from "~/server/actions/game";
import { getAllUsers, type User } from "~/server/actions/getUsers";
import type { MenuItem } from "~/server/actions/menu";
import { createOrder } from "~/server/actions/orders";
import type { BillingOption } from "./Billingselector";
import { GameDialog } from "./GameDialog";

interface OrderDrawerProps {
  drink: MenuItem | null;
  isOpen: boolean;
  onClose: () => void;
  selectedBilling: BillingOption;
}

export function OrderDrawer({
  drink,
  isOpen,
  onClose,
  selectedBilling,
}: OrderDrawerProps) {
  const [quantity, setQuantity] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [showGameDialog, setShowGameDialog] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load users when component mounts
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setLoadingUsers(true);
        const fetchedUsers = await getAllUsers();
        setUsers(fetchedUsers);
      } catch (error) {
        console.error("Error loading users:", error);
        toast.error("Fehler beim Laden der Benutzer");
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

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

  const handleBJClick = () => {
    setQuantity(2);
  };

  const handleGameResult = async (opponentId: string, won: boolean) => {
    try {
      const gameResult = await createGame({
        player2Id: opponentId,
        won: won,
        //orderId: lastOrderId,
      });

      if (gameResult.success) {
        const opponent = users.find((u) => u.id === opponentId);
        const resultText = won ? "gewonnen! 🎉" : "verloren 😅";
        toast.success(
          `Bierjunge ${resultText} gegen ${opponent?.name || opponent?.email}!`
        );
      } else {
        toast.error(
          gameResult.error || "Fehler beim Speichern des Spielergebnisses"
        );
      }
    } catch (error) {
      console.error("Game result error:", error);
      toast.error(
        "Ein Fehler beim Speichern des Spielergebnisses aufgetreten."
      );
    }
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
          bookingFor: selectedBilling,
        });

        if (orderResult.success) {
          toast.success(
            `${quantity}x ${drink.name} bestellt (€${(
              drink.price * quantity
            ).toFixed(2)}) - Abrechnung: ${selectedBilling}`
          );

          // Check if this was a BJ order (quantity = 2) and open game dialog
          if (quantity === 2) {
            setShowGameDialog(true);
          } else {
            handleClose();
          }
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
    setShowGameDialog(false);
  };

  if (!drink) return null;

  const totalPrice = drink.price * quantity;

  return (
    <>
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
            <DrawerTitle className="text-xl font-bold">
              {drink.name}
            </DrawerTitle>
            <DrawerDescription className="flex items-center justify-center gap-2">
              <Badge className="bg-green-500 text-white">Verfügbar</Badge>
              <span>€{drink.price.toFixed(2)} pro Stück</span>
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-6 space-y-6">
            {selectedBilling ? (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    Abrechnung:
                  </span>
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-900"
                  >
                    {selectedBilling}
                  </Badge>
                </div>
              </div>
            ) : null}

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
                  onClick={handleBJClick}
                  className="px-6"
                  disabled={isPending || loadingUsers}
                >
                  🍺BJ🍺
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
              className="flex-1 bg-transparent"
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

      {/* Game Dialog */}
      <GameDialog
        isOpen={showGameDialog}
        onClose={() => setShowGameDialog(false)}
        users={users}
        drinkName={drink?.name || ""}
        onGameResult={handleGameResult}
      />
    </>
  );
}
