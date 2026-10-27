"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import type * as React from "react";

import { cn } from "~/lib/utils";

/**
 * Where a column's cell goes in the phone card (below `md`):
 * - `title`: first line, bold; also the row header (`<th scope="row">`).
 * - `subtitle`: muted line under the title.
 * - `meta`: label and value, one per line (or two per line, see `metaLayout`).
 * - `action`: buttons at the bottom of the card.
 * - `hidden`: table only.
 */
export type MobileRole = "title" | "subtitle" | "meta" | "action" | "hidden";

export type DataListColumnMeta = {
	mobile: MobileRole;
	/** Label of a `meta` cell on phones. Defaults to a string `header`. */
	label?: string;
	/**
	 * Classes for the header and the cells. They apply at every size, so
	 * table-only styles (widths, alignment, sticky) need an `md:` prefix.
	 */
	className?: string;
	headerClassName?: string;
	cellClassName?: string;
};

/** A TanStack column with its place in the phone card. */
export type DataListColumn<T> = ColumnDef<T, unknown> & {
	meta: DataListColumnMeta;
};

type DataListProps<T> = {
	data: T[];
	columns: DataListColumn<T>[];
	getRowId: (row: T, index: number) => string;
	/** Read by screen readers; not shown. */
	caption?: string;
	/** Shown instead of the list when there are no rows. */
	empty?: React.ReactNode;
	/** Hides columns at every size (e.g. a "Spalten" menu). */
	columnVisibility?: VisibilityState;
	/** `grid` puts two meta cells per line, label above value. */
	metaLayout?: "rows" | "grid";
	/** Wrapper around the table (scroll container from `md` up). */
	className?: string;
	containerProps?: Omit<React.ComponentProps<"div">, "className" | "children">;
	tableProps?: Omit<React.ComponentProps<"table">, "children">;
	/** The header row (shown from `md` up). */
	headerClassName?: string;
	/** The card list below `md` (e.g. `sm:max-md:grid-cols-2`). */
	bodyClassName?: string;
	rowClassName?: string | ((row: T) => string | undefined);
};

// Below `md` the table is laid out as cards (display block / flex), which
// makes WebKit drop the table semantics. Explicit roles keep it a table for
// screen readers, so every cell is still announced with its column header.
const ROLE = {
	table: { role: "table" },
	rowgroup: { role: "rowgroup" },
	row: { role: "row" },
	columnheader: { role: "columnheader" },
	rowheader: { role: "rowheader" },
	cell: { role: "cell" },
} as const;

const CELL =
	"whitespace-nowrap p-2 text-left align-middle font-normal max-md:min-w-0 max-md:whitespace-normal max-md:p-0";

const ROLE_CELL: Record<MobileRole, string> = {
	title: "max-md:order-1 max-md:basis-full max-md:font-medium",
	subtitle:
		"max-md:order-2 max-md:basis-full max-md:text-muted-foreground max-md:text-sm",
	meta: "max-md:order-3 max-md:flex max-md:basis-full max-md:items-center max-md:justify-between max-md:gap-3 max-md:text-sm",
	action:
		"max-md:order-4 max-md:mt-1 max-md:flex max-md:basis-full max-md:flex-wrap max-md:items-center max-md:justify-end max-md:gap-2 max-md:empty:hidden",
	hidden: "max-md:hidden",
};

const META_GRID =
	"max-md:order-3 max-md:flex max-md:basis-1/2 max-md:flex-col max-md:items-start max-md:gap-0.5 max-md:pr-2 max-md:text-sm";

function metaOf<T>(column: { columnDef: ColumnDef<T, unknown> }) {
	return column.columnDef.meta as DataListColumnMeta;
}

/**
 * One list, one set of columns: a semantic table from `md` up and a card per
 * row below, from the same DOM. Each row is rendered once.
 */
export function DataList<T>({
	data,
	columns,
	getRowId,
	caption,
	empty,
	columnVisibility,
	metaLayout = "rows",
	className,
	containerProps,
	tableProps,
	headerClassName,
	bodyClassName,
	rowClassName,
}: DataListProps<T>) {
	const table = useReactTable({
		data,
		columns,
		getRowId,
		state: columnVisibility ? { columnVisibility } : {},
		getCoreRowModel: getCoreRowModel(),
	});

	if (data.length === 0 && empty !== undefined) {
		return <>{empty}</>;
	}

	return (
		<div
			data-slot="data-list"
			{...containerProps}
			className={cn("relative w-full md:overflow-x-auto", className)}
		>
			<table
				{...ROLE.table}
				{...tableProps}
				className={cn(
					"w-full caption-bottom text-sm tabular-nums max-md:block",
					tableProps?.className,
				)}
			>
				{caption && <caption className="sr-only">{caption}</caption>}
				<thead {...ROLE.rowgroup} className="max-md:sr-only">
					{table.getHeaderGroups().map((group) => (
						<tr
							key={group.id}
							{...ROLE.row}
							className={cn("border-b", headerClassName)}
						>
							{group.headers.map((header) => {
								const meta = metaOf(header.column);
								return (
									<th
										scope="col"
										{...ROLE.columnheader}
										key={header.id}
										className={cn(
											"h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-foreground",
											meta.className,
											meta.headerClassName,
										)}
									>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</th>
								);
							})}
						</tr>
					))}
				</thead>
				<tbody
					{...ROLE.rowgroup}
					className={cn("max-md:grid max-md:gap-3", bodyClassName)}
				>
					{table.getRowModel().rows.map((row) => (
						<tr
							key={row.id}
							{...ROLE.row}
							data-slot="data-list-row"
							className={cn(
								"border-b transition-colors hover:bg-muted/50 md:last:border-b-0",
								"max-md:flex max-md:flex-wrap max-md:gap-y-1.5 max-md:rounded-lg max-md:border max-md:bg-card max-md:p-3",
								typeof rowClassName === "function"
									? rowClassName(row.original)
									: rowClassName,
							)}
						>
							{row.getVisibleCells().map((cell) => {
								const meta = metaOf(cell.column);
								const content = flexRender(
									cell.column.columnDef.cell,
									cell.getContext(),
								);
								const classes = cn(
									CELL,
									meta.mobile === "meta" && metaLayout === "grid"
										? META_GRID
										: ROLE_CELL[meta.mobile],
									meta.className,
									meta.cellClassName,
								);
								if (meta.mobile === "title") {
									return (
										<th
											key={cell.id}
											scope="row"
											{...ROLE.rowheader}
											className={classes}
										>
											{content}
										</th>
									);
								}
								if (meta.mobile !== "meta") {
									return (
										<td key={cell.id} {...ROLE.cell} className={classes}>
											{content}
										</td>
									);
								}
								const header = cell.column.columnDef.header;
								const label =
									meta.label ?? (typeof header === "string" ? header : "");
								return (
									<td key={cell.id} {...ROLE.cell} className={classes}>
										{/* The header already names the cell for screen readers. */}
										<span
											aria-hidden="true"
											className={cn(
												"text-muted-foreground md:hidden",
												metaLayout === "grid" && "text-xs",
											)}
										>
											{label}
										</span>
										<div
											className={cn(
												"min-w-0",
												metaLayout === "rows" && "max-md:text-right",
											)}
										>
											{content}
										</div>
									</td>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
