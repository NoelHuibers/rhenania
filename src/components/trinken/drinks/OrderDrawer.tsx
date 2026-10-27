"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { NumericInput } from "~/components/NumericInput";
import { Button } from "~/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "~/components/ui/drawer";
import { IconButton } from "~/components/ui/icon-button";
import { StatusBadge } from "~/components/ui/status-badge";
import {
	clampOrderAmount,
	confirmLabel,
	MAX_ORDER_AMOUNT,
	MIN_ORDER_AMOUNT,
	quantityPresets,
} from "~/lib/drink-order";
import { formatEUR } from "~/lib/format";
import { roundToCent } from "~/lib/money";
import type { MenuItem } from "~/server/actions/menu";
import type { BillingOption } from "./Billingselector";

/** One opened drawer: the drink (priced for `billing`) and its gate key. */
export type OrderIntent = {
	key: number;
	drink: MenuItem;
	billing: BillingOption;
	quantity: number;
};

interface OrderDrawerProps {
	intent: OrderIntent | null;
	open: boolean;
	onCancel: () => void;
	onConfirm: (intent: OrderIntent) => void;
}

/**
 * Bottom sheet with quantity 1 preselected, so the default order is one
 * tap on the drink and one on the confirm button. The confirm button sits
 * full width at the bottom, in the thumb zone, and says what it books.
 */
export function OrderDrawer({
	intent,
	open,
	onCancel,
	onConfirm,
}: OrderDrawerProps) {
	return (
		<Drawer
			open={open && intent !== null}
			onOpenChange={(next) => {
				if (!next) {
					onCancel();
				}
			}}
		>
			<DrawerContent className="flex max-h-[90vh] flex-col">
				{intent ? (
					// Keyed by the gate key: every opened drawer starts at its own quantity.
					<OrderForm key={intent.key} intent={intent} onConfirm={onConfirm} />
				) : null}
			</DrawerContent>
		</Drawer>
	);
}

function OrderForm({
	intent,
	onConfirm,
}: {
	intent: OrderIntent;
	onConfirm: (intent: OrderIntent) => void;
}) {
	const { drink, billing } = intent;
	const [quantity, setQuantity] = useState(clampOrderAmount(intent.quantity));
	const total = roundToCent(drink.price * quantity);
	const presets = quantityPresets(drink.kastengroesse);

	return (
		<>
			<DrawerHeader className="flex-shrink-0">
				<DrawerTitle className="font-bold text-xl">{drink.name}</DrawerTitle>
				<DrawerDescription>
					{formatEUR(drink.price)} pro Stück
				</DrawerDescription>
				{billing ? (
					<StatusBadge tone="warning" className="mx-auto mt-1 md:mx-0">
						Buchung auf {billing}
					</StatusBadge>
				) : null}
			</DrawerHeader>

			<div className="flex-1 space-y-4 overflow-y-auto px-4 pb-2">
				<div className="flex items-center justify-center gap-3">
					<IconButton
						label="Menge verringern"
						tooltip={false}
						variant="outline"
						onClick={() => setQuantity((q) => clampOrderAmount(q - 1))}
						disabled={quantity <= MIN_ORDER_AMOUNT}
						className="size-11"
					>
						<Minus className="size-5" />
					</IconButton>
					<NumericInput
						aria-label="Menge"
						value={quantity}
						onChange={(value) => setQuantity(clampOrderAmount(value))}
						className="h-11 w-20 text-center font-bold text-lg"
						min={MIN_ORDER_AMOUNT}
						max={MAX_ORDER_AMOUNT}
					/>
					<IconButton
						label="Menge erhöhen"
						tooltip={false}
						variant="outline"
						onClick={() => setQuantity((q) => clampOrderAmount(q + 1))}
						disabled={quantity >= MAX_ORDER_AMOUNT}
						className="size-11"
					>
						<Plus className="size-5" />
					</IconButton>
				</div>

				<fieldset className="flex justify-center gap-2">
					<legend className="sr-only">Menge wählen</legend>
					{presets.map((preset) => (
						<Button
							key={preset.label}
							type="button"
							variant={quantity === preset.amount ? "default" : "secondary"}
							aria-pressed={quantity === preset.amount}
							onClick={() => setQuantity(preset.amount)}
							className="h-11 min-w-11 px-4"
						>
							{preset.label}
						</Button>
					))}
				</fieldset>
			</div>

			<DrawerFooter className="flex-shrink-0 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
				<Button
					type="button"
					onClick={() => onConfirm({ ...intent, quantity })}
					className="h-12 w-full text-base"
				>
					{confirmLabel(billing, total)}
				</Button>
			</DrawerFooter>
		</>
	);
}
