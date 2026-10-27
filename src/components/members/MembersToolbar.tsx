"use client";

import type { VisibilityState } from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "~/components/ui/button";
import type { DataListColumn } from "~/components/ui/data-list";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import type { MemberListItem } from "~/server/actions/members/members";

/** Search, Abteilung filter, row count, column menu and scroll buttons. */
export function MembersToolbar({
	search,
	onSearchChange,
	statusFilter,
	onStatusFilterChange,
	statuses,
	visibleCount,
	totalCount,
	columns,
	columnVisibility,
	onColumnVisibilityChange,
	overflow,
	onScroll,
}: {
	search: string;
	onSearchChange: (search: string) => void;
	statusFilter: string;
	onStatusFilterChange: (status: string) => void;
	statuses: string[];
	visibleCount: number;
	totalCount: number;
	columns: DataListColumn<MemberListItem>[];
	columnVisibility: VisibilityState;
	onColumnVisibilityChange: Dispatch<SetStateAction<VisibilityState>>;
	overflow: { left: boolean; right: boolean };
	onScroll: (dir: 1 | -1) => void;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="relative w-full sm:max-w-xs">
				<Search
					aria-hidden="true"
					className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Suche Name, E-Mail, Ort…"
					aria-label="Mitglieder suchen"
					className="pl-9"
				/>
			</div>
			<div className="flex items-center gap-2">
				<Select value={statusFilter} onValueChange={onStatusFilterChange}>
					<SelectTrigger
						className="w-[170px]"
						aria-label="Nach Abteilung filtern"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="alle">Alle Abteilungen</SelectItem>
						{statuses.map((s) => (
							<SelectItem key={s} value={s}>
								{s}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="whitespace-nowrap text-muted-foreground text-sm tabular-nums">
					<span aria-hidden="true">
						{visibleCount}
						<span className="text-muted-foreground"> / {totalCount}</span>
					</span>
					<span className="sr-only">
						{visibleCount} von {totalCount} Mitgliedern
					</span>
				</span>
				<div className="hidden items-center gap-1 md:flex">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="outline" size="sm">
								<SlidersHorizontal className="mr-1 h-4 w-4" /> Spalten
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							className="max-h-[60vh] overflow-auto"
						>
							<DropdownMenuLabel>Spalten anzeigen</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{columns
								.filter((c) => c.enableHiding !== false)
								.map((c) => (
									<DropdownMenuCheckboxItem
										key={c.id}
										checked={columnVisibility[c.id ?? ""] !== false}
										onCheckedChange={(v) =>
											onColumnVisibilityChange((prev) => ({
												...prev,
												[c.id ?? ""]: !!v,
											}))
										}
										onSelect={(e) => e.preventDefault()}
									>
										{String(c.header)}
									</DropdownMenuCheckboxItem>
								))}
						</DropdownMenuContent>
					</DropdownMenu>
					{(overflow.left || overflow.right) && (
						<>
							<IconButton
								variant="outline"
								size="icon-sm"
								label="Nach links scrollen"
								disabled={!overflow.left}
								onClick={() => onScroll(-1)}
							>
								<ChevronLeft className="h-4 w-4" />
							</IconButton>
							<IconButton
								variant="outline"
								size="icon-sm"
								label="Nach rechts scrollen"
								disabled={!overflow.right}
								onClick={() => onScroll(1)}
							>
								<ChevronRight className="h-4 w-4" />
							</IconButton>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
