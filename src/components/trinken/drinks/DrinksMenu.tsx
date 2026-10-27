"use client";

import { ChevronDown, Coffee, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { EmptyState } from "~/components/ui/empty-state";
import { IconButton } from "~/components/ui/icon-button";
import { statusClass } from "~/components/ui/status-badge";
import {
	createOrderGate,
	orderToastMessage,
	splitMenu,
	withRecentDrink,
} from "~/lib/drink-order";
import { roundToCent } from "~/lib/money";
import { unitPriceFor } from "~/lib/pricing";
import { cn } from "~/lib/utils";
import type { MenuItem } from "~/server/actions/menu";
import { createOrder } from "~/server/actions/orders";
import { type BillingOption, BillingSelector } from "./Billingselector";
import { DrinkButton } from "./DrinkButton";
import { OrderDrawer, type OrderIntent } from "./OrderDrawer";

interface DrinksMenuProps {
	drinks: MenuItem[];
	markupPercent: number;
	/** The member's most ordered drinks of the last 30 days. */
	recentDrinkIds: string[];
}

/**
 * The ordering screen (#74). Default path: tap a drink, tap the confirm
 * button. The drawer closes at once (optimistic); the success toast only
 * appears once the server has booked the order, and a failed order puts
 * the account choice back and offers a retry.
 */
export function DrinksMenu({
	drinks,
	markupPercent,
	recentDrinkIds,
}: DrinksMenuProps) {
	const [gate] = useState(() => createOrderGate());
	const [selectedBilling, setSelectedBilling] = useState<BillingOption>(null);
	const [intent, setIntent] = useState<OrderIntent | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [recentIds, setRecentIds] = useState<string[]>(recentDrinkIds);

	// Show what the member is actually charged: personal orders carry the
	// tenant's markup (if any), group bookings the plain price. The server
	// recomputes the price on order, this is display only.
	const pricedDrinks = drinks.map((drink) => ({
		...drink,
		price: unitPriceFor(drink.price, markupPercent, selectedBilling),
	}));
	const { recent, available, unavailable } = splitMenu(pricedDrinks, recentIds);

	const openDrawer = (
		drink: MenuItem,
		billing: BillingOption,
		quantity = 1,
	) => {
		const key = gate.open();
		if (key === null) {
			return; // second half of a double tap on the confirm button
		}
		setIntent({ key, drink, billing, quantity });
		setDrawerOpen(true);
	};

	const handleCancel = () => {
		gate.cancel(intent?.key ?? null);
		setDrawerOpen(false);
	};

	const handleConfirm = async (order: OrderIntent) => {
		// Each opened drawer books at most once, however often it is tapped.
		if (!gate.claim(order.key)) {
			return;
		}
		const { drink, billing, quantity } = order;
		const total = roundToCent(drink.price * quantity);
		const previousRecent = recentIds;

		// Optimistic: close, show the drink as a shortcut and book the next
		// drink on the member again, so a group account never carries over.
		setDrawerOpen(false);
		setSelectedBilling(null);
		setRecentIds((ids) => withRecentDrink(ids, drink.id));
		const toastId = toast.loading(`${quantity}x ${drink.name} wird gebucht …`);

		const rollback = (message: string) => {
			setRecentIds(previousRecent);
			setSelectedBilling((current) => current ?? billing);
			toast.error(message, {
				id: toastId,
				action: {
					label: "Erneut versuchen",
					onClick: () => openDrawer(drink, billing, quantity),
				},
			});
		};

		try {
			const result = await createOrder({
				drinkId: drink.id,
				drinkName: drink.name,
				amount: quantity,
				pricePerUnit: drink.price,
				total,
				bookingFor: billing,
			});
			if (result.success) {
				toast.success(orderToastMessage(quantity, drink.name, total, billing), {
					id: toastId,
				});
			} else {
				rollback(result.error || "Ein Fehler ist aufgetreten.");
			}
		} catch (error) {
			console.error("Order error:", error);
			rollback("Ein unerwarteter Fehler ist aufgetreten.");
		}
	};

	if (drinks.length === 0) {
		return (
			<div className="container mx-auto p-4">
				<EmptyState icon={<Coffee />} title="Keine Getränke verfügbar">
					Die Getränkekarte ist noch leer. Bitte wende dich an den Getränkewart
					oder Admin.
				</EmptyState>
			</div>
		);
	}

	const select = (drink: MenuItem) => openDrawer(drink, selectedBilling);

	return (
		<>
			{selectedBilling ? (
				<div
					className={cn(
						"sticky top-0 z-10 flex min-h-12 items-center justify-between gap-2 border-b px-4",
						statusClass({ tone: "warning" }),
					)}
				>
					<span className="font-medium text-sm">
						Buchung auf {selectedBilling}
					</span>
					<IconButton
						label="Wieder auf eigene Kosten buchen"
						onClick={() => setSelectedBilling(null)}
					>
						<X className="size-5" />
					</IconButton>
				</div>
			) : null}

			<div className="container mx-auto space-y-6 p-4">
				{recent.length > 0 ? (
					<section aria-labelledby="trinken-recent" className="space-y-2">
						<h2 id="trinken-recent" className="font-semibold text-base">
							Zuletzt bestellt
						</h2>
						<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
							{recent.map((drink) => (
								<DrinkButton
									key={drink.id}
									drink={drink}
									onSelect={select}
									variant="tile"
								/>
							))}
						</div>
					</section>
				) : null}

				<section aria-labelledby="trinken-menu" className="space-y-3">
					<h2 id="trinken-menu" className="font-semibold text-base">
						Getränke
					</h2>
					<BillingSelector
						selectedBilling={selectedBilling}
						onBillingChange={setSelectedBilling}
					/>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{available.map((drink) => (
							<DrinkButton key={drink.id} drink={drink} onSelect={select} />
						))}
					</div>
				</section>

				{unavailable.length > 0 ? (
					<Collapsible>
						<CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between rounded-md px-1 text-left text-muted-foreground text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
							Nicht verfügbar ({unavailable.length})
							<ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
						</CollapsibleTrigger>
						<CollapsibleContent className="pt-2">
							<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{unavailable.map((drink) => (
									<DrinkButton key={drink.id} drink={drink} onSelect={select} />
								))}
							</div>
						</CollapsibleContent>
					</Collapsible>
				) : null}
			</div>

			<OrderDrawer
				intent={intent}
				open={drawerOpen}
				onCancel={handleCancel}
				onConfirm={handleConfirm}
			/>
		</>
	);
}
