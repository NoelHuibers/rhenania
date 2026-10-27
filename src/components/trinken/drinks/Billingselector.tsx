"use client";
import { ChevronDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	BOOKING_ACCOUNTS,
	type BookingAccount,
	COMMON_BOOKING_ACCOUNTS,
} from "~/lib/drink-order";

/** Group account the next order is booked on; null books on the member. */
export type BillingOption = BookingAccount | null;

interface BillingSelectorProps {
	selectedBilling: BillingOption;
	onBillingChange: (billing: BillingOption) => void;
}

const rareOptions = BOOKING_ACCOUNTS.filter(
	(a) => !COMMON_BOOKING_ACCOUNTS.includes(a),
);

export function BillingSelector({
	selectedBilling,
	onBillingChange,
}: BillingSelectorProps) {
	// Tapping the selected account again books on the member again.
	const toggle = (option: BookingAccount) =>
		onBillingChange(selectedBilling === option ? null : option);
	const rareSelected =
		selectedBilling !== null && rareOptions.includes(selectedBilling);

	return (
		<fieldset className="min-w-0">
			<legend className="mb-1.5 text-muted-foreground text-xs">
				Auf ein Konto buchen (optional)
			</legend>
			<div className="flex flex-nowrap gap-2 overflow-x-auto">
				{COMMON_BOOKING_ACCOUNTS.map((option) => (
					<Button
						key={option}
						type="button"
						variant={selectedBilling === option ? "default" : "outline"}
						aria-pressed={selectedBilling === option}
						onClick={() => toggle(option)}
						className="h-11 min-w-16 shrink-0 px-3"
					>
						{option}
					</Button>
				))}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant={rareSelected ? "default" : "outline"}
							className="h-11 shrink-0 gap-1 px-3"
						>
							{rareSelected ? selectedBilling : "Weitere"}
							<ChevronDown className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{rareOptions.map((option) => (
							<DropdownMenuItem
								key={option}
								onClick={() => toggle(option)}
								className={`min-h-11 ${selectedBilling === option ? "bg-accent" : ""}`}
							>
								{option}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</fieldset>
	);
}
