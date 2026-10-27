"use client";

import { Filter, Search } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";

// Component: Search Bar
interface SearchBarProps {
	searchTerm: string;
	onSearchChange: (value: string) => void;
}

export const SearchBar = ({ searchTerm, onSearchChange }: SearchBarProps) => (
	<div className="relative min-w-0 flex-1">
		<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
		<Input
			placeholder="Suche nach Käufer, Getränk oder Zweck..."
			value={searchTerm}
			onChange={(e) => onSearchChange(e.target.value)}
			className="pl-10"
		/>
	</div>
);

// Component: Filter Buttons
interface FilterButtonsProps {
	billStatusFilter: string;
	purposeFilter: string;
	onBillStatusChange: (value: string) => void;
	onPurposeChange: (value: string) => void;
	isMobile?: boolean;
}

const FilterButtons = ({
	billStatusFilter,
	purposeFilter,
	onBillStatusChange,
	onPurposeChange,
	isMobile = false,
}: FilterButtonsProps) => (
	<>
		<div className={isMobile ? "space-y-2" : "flex flex-col gap-2"}>
			<span className="whitespace-nowrap font-medium text-sm">
				Rechnungsstatus:
			</span>
			<div className="flex gap-2">
				<Button
					variant={billStatusFilter === "all" ? "default" : "outline"}
					size="sm"
					onClick={() => onBillStatusChange("all")}
					className={isMobile ? "flex-1" : ""}
				>
					Alle
				</Button>
				<Button
					variant={billStatusFilter === "billed" ? "default" : "outline"}
					size="sm"
					onClick={() => onBillStatusChange("billed")}
					className={isMobile ? "flex-1" : ""}
				>
					Abgerechnet
				</Button>
				<Button
					variant={billStatusFilter === "not_billed" ? "default" : "outline"}
					size="sm"
					onClick={() => onBillStatusChange("not_billed")}
					className={isMobile ? "flex-1" : ""}
				>
					Offen
				</Button>
			</div>
		</div>

		<div className={isMobile ? "space-y-2" : "flex flex-col gap-2"}>
			<span className="whitespace-nowrap font-medium text-sm">Zweck:</span>
			<div className="flex gap-2">
				<Button
					variant={purposeFilter === "all" ? "default" : "outline"}
					size="sm"
					onClick={() => onPurposeChange("all")}
					className={isMobile ? "flex-1" : ""}
				>
					Alle
				</Button>
				<Button
					variant={purposeFilter === "personal" ? "default" : "outline"}
					size="sm"
					onClick={() => onPurposeChange("personal")}
					className={isMobile ? "flex-1" : ""}
				>
					Persönlich
				</Button>
				<Button
					variant={purposeFilter === "events" ? "default" : "outline"}
					size="sm"
					onClick={() => onPurposeChange("events")}
					className={isMobile ? "flex-1" : ""}
				>
					Veranstaltungen
				</Button>
			</div>
		</div>
	</>
);

// Component: Desktop Filters Card
interface DesktopFiltersProps {
	searchTerm: string;
	billStatusFilter: string;
	purposeFilter: string;
	onSearchChange: (value: string) => void;
	onBillStatusChange: (value: string) => void;
	onPurposeChange: (value: string) => void;
}

export const DesktopFilters = ({
	searchTerm,
	billStatusFilter,
	purposeFilter,
	onSearchChange,
	onBillStatusChange,
	onPurposeChange,
}: DesktopFiltersProps) => (
	<Card className="hidden sm:block">
		<CardHeader>
			<CardTitle className="flex items-center gap-2">
				<Filter className="h-5 w-5" />
				Filter & Suche
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div className="flex flex-col items-start gap-4 lg:flex-row lg:items-end">
				<SearchBar searchTerm={searchTerm} onSearchChange={onSearchChange} />
				<FilterButtons
					billStatusFilter={billStatusFilter}
					purposeFilter={purposeFilter}
					onBillStatusChange={onBillStatusChange}
					onPurposeChange={onPurposeChange}
				/>
			</div>
		</CardContent>
	</Card>
);

// Component: Mobile Filter Sheet
interface MobileFilterSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	billStatusFilter: string;
	purposeFilter: string;
	onBillStatusChange: (value: string) => void;
	onPurposeChange: (value: string) => void;
}

export const MobileFilterSheet = ({
	open,
	onOpenChange,
	billStatusFilter,
	purposeFilter,
	onBillStatusChange,
	onPurposeChange,
}: MobileFilterSheetProps) => (
	<Sheet open={open} onOpenChange={onOpenChange}>
		<SheetTrigger asChild>
			<span />
		</SheetTrigger>
		<SheetContent side="bottom" className="h-[400px]">
			<SheetHeader>
				<SheetTitle>Filter</SheetTitle>
			</SheetHeader>
			<div className="space-y-4 px-4">
				<FilterButtons
					billStatusFilter={billStatusFilter}
					purposeFilter={purposeFilter}
					onBillStatusChange={onBillStatusChange}
					onPurposeChange={onPurposeChange}
					isMobile={true}
				/>
				<Button onClick={() => onOpenChange(false)} className="w-full">
					Filter anwenden
				</Button>
			</div>
		</SheetContent>
	</Sheet>
);
