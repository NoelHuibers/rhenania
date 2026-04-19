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
import type { MenuItem } from "~/server/actions/menu";
import { createOrder } from "~/server/actions/orders";
import type { BillingOption } from "./Billingselector";

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

	const handleQuantityChange = (value: number) => {
		if (!Number.isNaN(value) && value >= 1) {
			setQuantity(value);
		}
	};

	const adjustQuantity = (delta: number) => {
		setQuantity(Math.max(1, quantity + delta));
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
					bookingFor: selectedBilling,
				});

				if (orderResult.success) {
					handleClose();
					toast.success(
						`${quantity}x ${drink.name} bestellt (€${(
							drink.price * quantity
						).toFixed(2)}) - Abrechnung auf ${
							selectedBilling ? selectedBilling : "eigene Kosten"
						}`,
					);
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
		setQuantity(1);
	};

	if (!drink) return null;

	const totalPrice = drink.price * quantity;

	return (
		<Drawer open={isOpen} onOpenChange={handleClose}>
			<DrawerContent className="flex max-h-[90vh] flex-col">
				<DrawerHeader className="flex-shrink-0 text-center">
					<div className="mb-2 flex justify-center">
						<div className="relative h-20 w-20">
							<Image
								src={drink.picture || "/placeholder.svg"}
								alt={drink.name}
								fill
								className="rounded-lg object-cover"
							/>
						</div>
					</div>
					<DrawerTitle className="font-bold text-lg">{drink.name}</DrawerTitle>
					<DrawerDescription className="flex items-center justify-center gap-2 text-sm">
						<Badge className="h-5 bg-green-500 text-white text-xs">
							Verfügbar
						</Badge>
						<span>€{drink.price.toFixed(2)} pro Stück</span>
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2">
					{selectedBilling ? (
						<div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
							<div className="flex items-center justify-between">
								<span className="font-medium text-blue-900 text-sm">
									Abrechnung:
								</span>
								<Badge
									variant="secondary"
									className="h-5 bg-blue-100 text-blue-900 text-xs"
								>
									{selectedBilling}
								</Badge>
							</div>
						</div>
					) : null}

					{/* Quantity Controls */}
					<div className="space-y-3">
						<div className="flex items-center justify-center gap-3">
							<Button
								variant="outline"
								size="icon"
								onClick={() => adjustQuantity(-1)}
								disabled={quantity <= 1 || isPending}
								className="h-9 w-9"
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
								className="h-9 w-9"
							>
								<Plus className="h-4 w-4" />
							</Button>
						</div>

						{/* Preset Buttons */}
						<div className="flex justify-center gap-3">
							<Button
								variant="secondary"
								onClick={() => setPresetQuantity(drink.kastengroesse ?? 20)}
								className="h-9 px-5"
								disabled={isPending}
							>
								K
							</Button>
						</div>
					</div>

					{/* Price Summary */}
					<div className="space-y-1 rounded-lg bg-muted/50 p-3">
						<div className="flex justify-between text-sm">
							<span>
								{quantity}x {drink.name}
							</span>
							<span>€{totalPrice.toFixed(2)}</span>
						</div>
						<div className="mt-1 flex justify-between border-t pt-1 font-bold text-base">
							<span>Gesamt</span>
							<span className="text-emerald-600 dark:text-emerald-400">
								€{totalPrice.toFixed(2)}
							</span>
						</div>
					</div>
				</div>

				<DrawerFooter className="flex flex-shrink-0 flex-row gap-3 pt-3 pb-4">
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
						<ShoppingCart className="mr-2 h-4 w-4" />
						{isPending ? "Bestelle..." : "Bestätigen"}
					</Button>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
