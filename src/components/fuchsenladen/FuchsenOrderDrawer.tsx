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
import type { FuchsenItem } from "~/server/actions/fuchsenladen/items";
import { createFuchsenOrder } from "~/server/actions/fuchsenladen/orders";

interface FuchsenOrderDrawerProps {
	item: FuchsenItem | null;
	isOpen: boolean;
	onClose: () => void;
}

export function FuchsenOrderDrawer({
	item,
	isOpen,
	onClose,
}: FuchsenOrderDrawerProps) {
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

	const handleClose = () => {
		onClose();
		setQuantity(1);
	};

	const handleConfirm = () => {
		if (!item) return;

		startTransition(async () => {
			try {
				const result = await createFuchsenOrder({
					itemId: item.id,
					itemName: item.name,
					amount: quantity,
					pricePerUnit: item.price,
					total: item.price * quantity,
				});

				if (result.success) {
					handleClose();
					toast.success(
						`${quantity}x ${item.name} bestellt (€${(
							item.price * quantity
						).toFixed(2)})`,
					);
				} else {
					toast.error(result.error || "Ein Fehler ist aufgetreten.");
				}
			} catch (error) {
				console.error("Fuchsen order error:", error);
				toast.error("Ein unerwarteter Fehler ist aufgetreten.");
			}
		});
	};

	if (!item) return null;

	const totalPrice = item.price * quantity;

	return (
		<Drawer open={isOpen} onOpenChange={handleClose}>
			<DrawerContent className="flex max-h-[90vh] flex-col">
				<DrawerHeader className="flex-shrink-0 text-center">
					<div className="mb-2 flex justify-center">
						<div className="relative h-20 w-20">
							<Image
								src={item.picture || "/placeholder.svg"}
								alt={item.name}
								fill
								className="rounded-lg object-cover"
							/>
						</div>
					</div>
					<DrawerTitle className="font-bold text-lg">{item.name}</DrawerTitle>
					<DrawerDescription className="flex items-center justify-center gap-2 text-sm">
						<Badge className="h-5 bg-green-500 text-white text-xs">
							Verfügbar
						</Badge>
						<span>€{item.price.toFixed(2)} pro Stück</span>
					</DrawerDescription>
				</DrawerHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-6 pb-2">
					{item.description && (
						<p className="text-center text-muted-foreground text-sm">
							{item.description}
						</p>
					)}

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
					</div>

					<div className="space-y-1 rounded-lg bg-muted/50 p-3">
						<div className="flex justify-between text-sm">
							<span>
								{quantity}x {item.name}
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
