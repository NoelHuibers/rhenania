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

/** Chip value for "no group account": the order goes on the member's bill. */
const PERSONAL = "privat";
/** Label of that chip. */
const PERSONAL_LABEL = "Privat";

const rareOptions = BOOKING_ACCOUNTS.filter(
	(a) => !COMMON_BOOKING_ACCOUNTS.includes(a),
);

export function BillingSelector({
	selectedBilling,
	onBillingChange,
}: BillingSelectorProps) {
	const labelId = useId();
	const rareSelected =
		selectedBilling !== null && rareOptions.includes(selectedBilling);

	// The common accounts are chips; a rarer account picked from "Weitere"
	// joins them as a chip so the choice stays visible.
	const options: ChipOption<string>[] = [
		{ value: PERSONAL, label: PERSONAL_LABEL },
		...COMMON_BOOKING_ACCOUNTS.map((a) => ({ value: a, label: a })),
		...(rareSelected
			? [{ value: selectedBilling, label: selectedBilling }]
			: []),
	];

	const select = (value: string) =>
		onBillingChange(value === PERSONAL ? null : (value as BookingAccount));

	return (
		<div className="min-w-0">
			<p id={labelId} className="mb-1.5 text-muted-foreground text-xs">
				Auf ein Konto buchen (optional)
			</p>
			<div className="flex min-w-0 items-center gap-1.5">
				<ChipGroup
					aria-labelledby={labelId}
					size="lg"
					value={selectedBilling ?? PERSONAL}
					onValueChange={select}
					options={options}
					className="flex-1"
				/>
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
						<DropdownMenuRadioGroup
							value={selectedBilling ?? PERSONAL}
							onValueChange={select}
						>
							{rareOptions.map((option) => (
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
			</div>
		</div>
	);
}
