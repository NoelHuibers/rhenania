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
  | "ofCC"
  | "Stiftungsfest"
  | null;

interface BillingSelectorProps {
  selectedBilling: BillingOption;
  onBillingChange: (billing: BillingOption) => void;
}

const commonOptions: BillingOption[] = ["CC", "AKN", "CBesuch"];
const rareOptions: BillingOption[] = ["AHV", "ofCC", "Stiftungsfest"];

export function BillingSelector({
  selectedBilling,
  onBillingChange,
}: BillingSelectorProps) {
  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Quick access buttons for common options */}
        {commonOptions.map((option) => (
          <Button
            key={option}
            variant={selectedBilling === option ? "default" : "outline"}
            size="sm"
            onClick={() => onBillingChange(option)}
            className="min-w-[80px]"
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
              className="gap-1"
            >
              Weitere
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rareOptions.map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => onBillingChange(option)}
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
