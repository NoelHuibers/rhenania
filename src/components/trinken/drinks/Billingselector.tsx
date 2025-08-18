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
  | "Stiftungsfest"
  | null;

interface BillingSelectorProps {
  selectedBilling: BillingOption;
  onBillingChange: (billing: BillingOption) => void;
}

const commonOptions: BillingOption[] = ["CC", "AKN", "CBesuch"];
const rareOptions: BillingOption[] = ["AHV", "RC", "Stiftungsfest"];

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
    <div className="bg-muted/30 rounded-lg p-3 sm:p-4 space-y-3">
      <div className="flex flex-nowrap gap-1 sm:gap-2">
        {/* Quick access buttons for common options */}
        {commonOptions.map((option) => (
          <Button
            key={option}
            variant={selectedBilling === option ? "default" : "outline"}
            size="sm"
            onClick={() => handleOptionClick(option)}
            className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 min-w-[50px] sm:min-w-[80px]"
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
              className="flex-shrink-0 gap-1 text-xs sm:text-sm px-2 sm:px-3"
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
