"use client";

import { Filter, X } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "~/components/ui/sheet";
import { Switch } from "~/components/ui/switch";

/** "Nur nicht abgerechnet" and the date range: inline on desktop, a sheet on phones. */
export function RecentOrdersFilters({
	showOutOfBillOnly,
	setShowOutOfBillOnly,
	fromDate,
	setFromDate,
	toDate,
	setToDate,
	hasAnyFilter,
	resetFilters,
}: {
	showOutOfBillOnly: boolean;
	setShowOutOfBillOnly: (value: boolean) => void;
	fromDate: string;
	setFromDate: (value: string) => void;
	toDate: string;
	setToDate: (value: string) => void;
	hasAnyFilter: boolean;
	resetFilters: () => void;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
			{/* Desktop: inline controls */}
			<div className="hidden items-center gap-4 sm:flex">
				<div className="flex items-center space-x-2">
					<Switch
						id="out-of-bill-only"
						checked={showOutOfBillOnly}
						onCheckedChange={setShowOutOfBillOnly}
					/>
					<Label
						htmlFor="out-of-bill-only"
						className="cursor-pointer select-none"
					>
						Nur nicht abgerechnet
					</Label>
				</div>

				<div className="flex w-auto flex-wrap gap-2 sm:items-end">
					<div className="min-w-0">
						<Label htmlFor="fromDate" className="sr-only">
							Von
						</Label>
						<Input
							id="fromDate"
							type="date"
							className="w-44"
							value={fromDate}
							onChange={(e) => setFromDate(e.target.value)}
						/>
					</div>
					<span className="self-center text-muted-foreground">bis</span>
					<div className="min-w-0">
						<Label htmlFor="toDate" className="sr-only">
							Bis
						</Label>
						<Input
							id="toDate"
							type="date"
							className="w-44"
							value={toDate}
							onChange={(e) => setToDate(e.target.value)}
						/>
					</div>
					<Button variant="outline" size="sm" aria-label="Filter anwenden">
						<Filter className="h-4 w-4" />
					</Button>
					{hasAnyFilter && (
						<Button
							variant="ghost"
							size="sm"
							onClick={resetFilters}
							aria-label="Filter zurücksetzen"
						>
							<X className="mr-1 h-4 w-4" />
							Zurücksetzen
						</Button>
					)}
				</div>
			</div>

			{/* Mobile: compact trigger + summary */}
			<div className="flex items-center justify-between sm:hidden">
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="outline" size="sm" className="gap-2">
							<Filter className="h-4 w-4" />
							Filter
							{hasAnyFilter && (
								<span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">
									1
								</span>
							)}
						</Button>
					</SheetTrigger>
					<SheetContent side="bottom" className="space-y-4 p-4">
						<SheetHeader>
							<SheetTitle>Filter</SheetTitle>
						</SheetHeader>

						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label
									htmlFor="out-of-bill-only-mobile"
									className="cursor-pointer select-none"
								>
									Nur nicht abgerechnet
								</Label>
								<Switch
									id="out-of-bill-only-mobile"
									checked={showOutOfBillOnly}
									onCheckedChange={setShowOutOfBillOnly}
								/>
							</div>

							<div className="grid grid-cols-1 gap-3">
								<div className="grid gap-2">
									<Label htmlFor="fromDateMobile">Von</Label>
									<Input
										id="fromDateMobile"
										type="date"
										value={fromDate}
										onChange={(e) => setFromDate(e.target.value)}
									/>
								</div>
								<div className="grid gap-2">
									<Label htmlFor="toDateMobile">Bis</Label>
									<Input
										id="toDateMobile"
										type="date"
										value={toDate}
										onChange={(e) => setToDate(e.target.value)}
									/>
								</div>
							</div>
						</div>

						<SheetFooter className="flex items-center justify-between gap-2">
							<Button
								variant="ghost"
								onClick={resetFilters}
								className="justify-start"
							>
								<X className="mr-1 h-4 w-4" />
								Zurücksetzen
							</Button>
							<SheetClose asChild>
								<Button>Fertig</Button>
							</SheetClose>
						</SheetFooter>
					</SheetContent>
				</Sheet>

				{/* Active filter summary */}
				{hasAnyFilter && (
					<div className="ml-3 flex flex-wrap gap-2">
						{showOutOfBillOnly && (
							<Badge variant="secondary">Nicht abgerechnet</Badge>
						)}
						{(fromDate || toDate) && (
							<Badge variant="outline">
								{fromDate || "…"} – {toDate || "…"}
							</Badge>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
