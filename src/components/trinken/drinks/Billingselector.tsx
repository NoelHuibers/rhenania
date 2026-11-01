"use client";
import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { Button } from "~/components/ui/button";
import { ChipGroup, type ChipOption } from "~/components/ui/chip-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	type BookingAccountOption,
	splitBookingAccounts,
} from "~/lib/booking-accounts";

/** Group account the next order is booked on; null books on the member. */
export type BillingOption = string | null;

interface BillingSelectorProps {
	/** The active accounts, as the Getränkewart set them up. */
	accounts: readonly BookingAccountOption[];
	selectedBilling: BillingOption;
	onBillingChange: (billing: BillingOption) => void;
}

/** Chip value for "no group account": the order goes on the member's bill. */
const PERSONAL = "privat";
/** Label of that chip. */
const PERSONAL_LABEL = "Privat";

export function BillingSelector({
	accounts,
	selectedBilling,
	onBillingChange,
}: BillingSelectorProps) {
	const labelId = useId();
	if (accounts.length === 0) {
		return null;
	}

	// The pinned accounts are chips; one picked from "Weitere" joins them so
	// the choice stays visible. The row wraps, so no chip is ever cut off.
	const { chips, more } = splitBookingAccounts(accounts, selectedBilling);
	const options: ChipOption<string>[] = [
		{ value: PERSONAL, label: PERSONAL_LABEL },
		...chips.map((a) => ({ value: a, label: a })),
	];

	const select = (value: string) =>
		onBillingChange(value === PERSONAL ? null : value);

	return (
		<div className="min-w-0">
			<p id={labelId} className="mb-1.5 text-muted-foreground text-xs">
				Auf ein Konto buchen (optional)
			</p>
			<ChipGroup
				aria-labelledby={labelId}
				size="lg"
				wrap
				value={selectedBilling ?? PERSONAL}
				onValueChange={select}
				options={options}
				trailing={
					more.length > 0 ? (
						<MoreAccounts
							accounts={more}
							value={selectedBilling ?? PERSONAL}
							onSelect={select}
						/>
					) : null
				}
			/>
		</div>
	);
}

/** The accounts that are not chips, in a menu after the last chip. */
function MoreAccounts({
	accounts,
	value,
	onSelect,
}: {
	accounts: string[];
	value: string;
	onSelect: (value: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					className="h-11 shrink-0 gap-1 rounded-full px-3"
				>
					Weitere
					<ChevronDown className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuRadioGroup value={value} onValueChange={onSelect}>
					{accounts.map((option) => (
						<DropdownMenuRadioItem
							key={option}
							value={option}
							className="min-h-11"
						>
							{option}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
