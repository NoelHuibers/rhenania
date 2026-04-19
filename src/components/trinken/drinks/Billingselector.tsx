"use client";
import { ChevronDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

export type BillingOption =
	| "CC"
	| "AKN"
	| "CBesuch"
	| "AHV"
	| "RC"
	| "SC"
	| "Stiftungsfest"
	| "Nikolausbowle"
	| null;

interface BillingSelectorProps {
	selectedBilling: BillingOption;
	onBillingChange: (billing: BillingOption) => void;
}

const commonOptions: BillingOption[] = ["CC", "AKN", "CBesuch"];
const rareOptions: BillingOption[] = [
	"AHV",
	"RC",
	"SC",
	"Stiftungsfest",
	"Nikolausbowle",
];

export function BillingSelector({
	selectedBilling,
	onBillingChange,
}: BillingSelectorProps) {
	const handleOptionClick = (option: BillingOption) => {
		// If the same option is clicked, deselect it (set to null)
		if (selectedBilling === option) {
			onBillingChange(null);
		} else {
			onBillingChange(option);
		}
	};

	return (
		<div>
			<div className="flex flex-nowrap gap-1 sm:gap-2">
				{/* Quick access buttons for common options */}
				{commonOptions.map((option) => (
					<Button
						key={option}
						variant={selectedBilling === option ? "default" : "outline"}
						size="sm"
						onClick={() => handleOptionClick(option)}
						className="min-w-[50px] flex-shrink-0 px-2 text-xs sm:min-w-[80px] sm:px-3 sm:text-sm"
					>
						{option}
					</Button>
				))}
				{/* Dropdown for rare options */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant={
								rareOptions.includes(selectedBilling) ? "default" : "outline"
							}
							size="sm"
							className="flex-shrink-0 gap-1 px-2 text-xs sm:px-3 sm:text-sm"
						>
							Weitere
							<ChevronDown className="h-3 w-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{rareOptions.map((option) => (
							<DropdownMenuItem
								key={option}
								onClick={() => handleOptionClick(option)}
								className={selectedBilling === option ? "bg-accent" : ""}
							>
								{option}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
