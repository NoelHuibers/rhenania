"use client";

import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { Checkbox } from "~/components/ui/checkbox";
import type { DataListColumn } from "~/components/ui/data-list";
import { IconButton } from "~/components/ui/icon-button";
import { cn } from "~/lib/utils";
import type { MemberListItem } from "~/server/actions/members/members";
import {
	type CellProps,
	type CellStatus,
	Identity,
	StatusCell,
	TextCell,
} from "./MemberCells";
import {
	BOOL_COLS,
	type CellValue,
	type Change,
	cellId,
	cellLabel,
	type EditableKey,
	memberName,
	STATUS_COLUMN,
	TEXT_COLS,
} from "./member-edits";

// Header and cell styles of the wide table (from md up; below md every row
// is a card, see DataList).
const BASE_TH =
	"sticky top-0 z-20 h-auto whitespace-nowrap border-border border-b bg-card px-3 py-2.5 text-left align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide";
const BASE_TD =
	"align-middle text-sm md:border-border/50 md:border-t md:px-1 md:py-0.5";

/**
 * The members list columns: identity, Abteilung, the text fields, the
 * check boxes and the row actions, each with its place in the phone card.
 */
export function memberColumns({
	canEdit,
	drafts,
	cellStatus,
	cellProps,
	save,
	change,
	onEditFull,
	onRequestDelete,
}: {
	canEdit: boolean;
	drafts: Record<string, Change>;
	cellStatus: Record<string, CellStatus>;
	/** Wiring shared by the text and status cells of one member. */
	cellProps: (
		m: MemberListItem,
		key: EditableKey,
		column: string,
		value: string,
	) => CellProps;
	save: (changes: Change[]) => void;
	change: (
		m: MemberListItem,
		key: EditableKey,
		from: CellValue,
		to: CellValue,
	) => Change;
	onEditFull: (m: MemberListItem) => void;
	onRequestDelete: (m: MemberListItem) => void;
}): DataListColumn<MemberListItem>[] {
	const cols: DataListColumn<MemberListItem>[] = [
		{
			id: "identity",
			header: "Mitglied",
			enableHiding: false,
			cell: ({ row }) => <Identity m={row.original} />,
			meta: {
				mobile: "title",
				headerClassName: cn(BASE_TH, "left-0 z-30! min-w-[210px] bg-card"),
				cellClassName: cn(
					BASE_TD,
					"font-normal md:sticky md:left-0 md:z-10 md:min-w-[210px] md:bg-card md:group-hover:bg-muted/40",
				),
			},
		},
		{
			id: "status",
			header: STATUS_COLUMN,
			cell: ({ row }) => (
				<StatusCell
					{...cellProps(
						row.original,
						"status",
						STATUS_COLUMN,
						row.original.status,
					)}
				/>
			),
			meta: {
				mobile: "subtitle",
				headerClassName: cn(BASE_TH, "min-w-[120px]"),
				cellClassName: cn(BASE_TD, "md:min-w-[120px]"),
			},
		},
	];
	for (const c of TEXT_COLS) {
		const border = c.border ? "md:border-border/60 md:border-l" : "";
		cols.push({
			id: c.key,
			header: c.header,
			cell: ({ row }) => (
				<TextCell
					{...cellProps(
						row.original,
						c.key,
						c.header,
						(row.original[c.key] as string | null) ?? "",
					)}
				/>
			),
			meta: {
				mobile: "meta",
				headerClassName: cn(BASE_TH, c.w, border),
				cellClassName: cn(BASE_TD, c.w, border),
			},
		});
	}
	for (const c of BOOL_COLS) {
		const border = c.border ? "md:border-border/60 md:border-l" : "";
		cols.push({
			id: c.key,
			header: c.header,
			cell: ({ row }) => {
				const m = row.original;
				const id = cellId(m.id, c.key);
				const saved = Boolean(m[c.key]);
				const draft = drafts[id]?.to;
				const status = cellStatus[id];
				return (
					<div className="flex md:justify-center">
						<Checkbox
							checked={typeof draft === "boolean" ? draft : saved}
							disabled={!canEdit || status === "saving"}
							aria-label={cellLabel(c.label, m)}
							aria-invalid={typeof status === "object" || undefined}
							data-col={c.key}
							// Ticking a box is a deliberate change: it saves at once,
							// with the result announced and "Rückgängig" offered.
							onCheckedChange={(ch) =>
								save([change(m, c.key, saved, ch === true)])
							}
						/>
					</div>
				);
			},
			meta: {
				mobile: "meta",
				label: c.label,
				headerClassName: cn(BASE_TH, "text-center!", border),
				cellClassName: cn(BASE_TD, "md:text-center!", border),
			},
		});
	}
	cols.push({
		id: "actions",
		header: () => <span className="sr-only">Aktionen</span>,
		enableHiding: false,
		cell: ({ row: { original: m } }) => (
			<div className="flex justify-end gap-0.5 px-1 max-md:w-full max-md:gap-2 max-md:px-0">
				{/* Phones: mail and call straight from the card. */}
				{m.email && (
					<IconButton
						asChild
						variant="outline"
						label={`E-Mail an ${memberName(m)}`}
						className="md:hidden"
					>
						<a href={`mailto:${m.email}`}>
							<Mail className="h-4 w-4" />
						</a>
					</IconButton>
				)}
				{(m.mobile || m.phonePrivate) && (
					<IconButton
						asChild
						variant="outline"
						label={`${memberName(m)} anrufen`}
						className="md:hidden"
					>
						<a href={`tel:${m.mobile || m.phonePrivate}`}>
							<Phone className="h-4 w-4" />
						</a>
					</IconButton>
				)}
				{canEdit && (
					<>
						<IconButton
							size="icon-sm"
							label={`${memberName(m)} bearbeiten`}
							className="max-md:size-9"
							onClick={() => onEditFull(m)}
						>
							<Pencil className="h-4 w-4" />
						</IconButton>
						<IconButton
							size="icon-sm"
							label={`${memberName(m)} löschen`}
							className="text-muted-foreground hover:text-destructive max-md:size-9"
							onClick={() => onRequestDelete(m)}
						>
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</>
				)}
			</div>
		),
		meta: {
			mobile: "action",
			headerClassName: cn(
				BASE_TH,
				"right-0 z-30! w-[84px] border-border/60 border-l bg-card",
			),
			cellClassName: cn(
				BASE_TD,
				"md:sticky md:right-0 md:z-10 md:w-[84px] md:border-border/60 md:border-l md:bg-card md:group-hover:bg-muted/40",
			),
		},
	});
	return cols;
}
