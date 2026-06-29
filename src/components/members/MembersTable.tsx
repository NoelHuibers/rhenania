"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { Link2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import {
	type MemberListItem,
	updateMemberFields,
} from "~/server/actions/members/members";

type TextKey =
	| "lastName"
	| "firstName"
	| "status"
	| "title"
	| "email"
	| "email2"
	| "email3"
	| "mobile"
	| "phonePrivate"
	| "phonePrivate2"
	| "phoneWork"
	| "phoneWork2"
	| "street"
	| "houseNumber"
	| "postalCode"
	| "city"
	| "country"
	| "birthday"
	| "company"
	| "notes";

type BoolKey = "lettersOptOut" | "addressNeedsUpdate" | "forwarding";

const TEXT_COLS: { key: TextKey; header: string; w?: string }[] = [
	{ key: "lastName", header: "Nachname", w: "min-w-[140px]" },
	{ key: "firstName", header: "Vorname", w: "min-w-[120px]" },
	{ key: "status", header: "Abteilung", w: "min-w-[90px]" },
	{ key: "title", header: "Position", w: "min-w-[120px]" },
	{ key: "email", header: "E-Mail", w: "min-w-[200px]" },
	{ key: "email2", header: "E-Mail 2", w: "min-w-[180px]" },
	{ key: "email3", header: "E-Mail 3", w: "min-w-[180px]" },
	{ key: "mobile", header: "Mobil", w: "min-w-[150px]" },
	{ key: "phonePrivate", header: "Tel. privat", w: "min-w-[150px]" },
	{ key: "phonePrivate2", header: "Tel. privat 2", w: "min-w-[150px]" },
	{ key: "phoneWork", header: "Tel. gesch.", w: "min-w-[150px]" },
	{ key: "phoneWork2", header: "Tel. gesch. 2", w: "min-w-[150px]" },
	{ key: "street", header: "Straße", w: "min-w-[180px]" },
	{ key: "houseNumber", header: "Nr.", w: "min-w-[70px]" },
	{ key: "postalCode", header: "PLZ", w: "min-w-[80px]" },
	{ key: "city", header: "Ort", w: "min-w-[140px]" },
	{ key: "country", header: "Land", w: "min-w-[120px]" },
	{ key: "birthday", header: "Geburtstag", w: "min-w-[110px]" },
	{ key: "company", header: "Firma", w: "min-w-[180px]" },
	{ key: "notes", header: "Notizen", w: "min-w-[180px]" },
];

const BOOL_COLS: { key: BoolKey; header: string }[] = [
	{ key: "lettersOptOut", header: "Nur Email" },
	{ key: "addressNeedsUpdate", header: "Veraltet" },
	{ key: "forwarding", header: "Weiterl." },
];

function TextCell({
	value,
	disabled,
	onSave,
}: {
	value: string;
	disabled: boolean;
	onSave: (v: string) => void;
}) {
	return (
		<input
			// Remount when the underlying value changes (e.g. after re-import).
			key={value}
			defaultValue={value}
			disabled={disabled}
			onBlur={(e) => {
				const v = e.target.value;
				if (v !== value) onSave(v);
			}}
			className="w-full rounded bg-transparent px-2 py-1 text-sm outline-none focus:bg-muted/50 disabled:cursor-default"
		/>
	);
}

export function MembersTable({
	members,
	canEdit,
	onEditFull,
	onRequestDelete,
}: {
	members: MemberListItem[];
	canEdit: boolean;
	onEditFull: (m: MemberListItem) => void;
	onRequestDelete: (m: MemberListItem) => void;
}) {
	const router = useRouter();
	const [rows, setRows] = useState(members);
	const [globalFilter, setGlobalFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("alle");
	const [, startTransition] = useTransition();

	// Re-seed when the server data changes (import / add / delete refresh).
	useEffect(() => setRows(members), [members]);

	const saveField = (
		id: string,
		key: TextKey | BoolKey,
		value: string | boolean,
	) => {
		setRows((prev) =>
			prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)),
		);
		startTransition(async () => {
			const res = await updateMemberFields(id, { [key]: value });
			if (!res.success) {
				toast.error(res.error);
				router.refresh();
			}
		});
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: handlers (saveField/onEditFull/onRequestDelete) are stable across renders
	const columns = useMemo<ColumnDef<MemberListItem>[]>(() => {
		const cols: ColumnDef<MemberListItem>[] = TEXT_COLS.map((c) => ({
			accessorKey: c.key,
			header: c.header,
			cell: ({ row }) => (
				<div className={c.w}>
					<TextCell
						value={(row.original[c.key] as string | null) ?? ""}
						disabled={!canEdit}
						onSave={(v) => saveField(row.original.id, c.key, v)}
					/>
				</div>
			),
		}));
		for (const c of BOOL_COLS) {
			cols.push({
				accessorKey: c.key,
				header: c.header,
				cell: ({ row }) => (
					<div className="flex justify-center">
						<Checkbox
							checked={Boolean(row.original[c.key])}
							disabled={!canEdit}
							onCheckedChange={(ch) =>
								saveField(row.original.id, c.key, ch === true)
							}
						/>
					</div>
				),
			});
		}
		cols.push({
			id: "linked",
			header: "",
			cell: ({ row }) =>
				row.original.linked ? (
					<Link2 className="h-4 w-4 text-muted-foreground" />
				) : null,
		});
		if (canEdit) {
			cols.push({
				id: "actions",
				header: "",
				cell: ({ row }) => (
					<div className="flex justify-end gap-1">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onEditFull(row.original)}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onRequestDelete(row.original)}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				),
			});
		}
		return cols;
	}, [canEdit]);

	const filtered = useMemo(
		() =>
			statusFilter === "alle"
				? rows
				: rows.filter((r) => r.status === statusFilter),
		[rows, statusFilter],
	);

	const table = useReactTable({
		data: filtered,
		columns,
		state: { globalFilter },
		onGlobalFilterChange: setGlobalFilter,
		globalFilterFn: (row, _columnId, value) => {
			const q = String(value).toLowerCase();
			const m = row.original;
			return `${m.lastName} ${m.firstName} ${m.email ?? ""} ${m.city ?? ""}`
				.toLowerCase()
				.includes(q);
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
	});

	const statuses = useMemo(
		() => Array.from(new Set(rows.map((r) => r.status))).sort(),
		[rows],
	);

	return (
		<div className="space-y-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<Input
					value={globalFilter}
					onChange={(e) => setGlobalFilter(e.target.value)}
					placeholder="Suche Name, Email, Ort…"
					className="sm:max-w-xs"
				/>
				<Select value={statusFilter} onValueChange={setStatusFilter}>
					<SelectTrigger className="w-full sm:w-[180px]">
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
				<span className="text-muted-foreground text-sm">
					{table.getRowModel().rows.length} / {rows.length}
				</span>
			</div>

			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((hg) => (
						<TableRow key={hg.id}>
							{hg.headers.map((h) => (
								<TableHead key={h.id} className="whitespace-nowrap">
									{h.isPlaceholder
										? null
										: flexRender(h.column.columnDef.header, h.getContext())}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.length === 0 ? (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="h-24 text-center text-muted-foreground"
							>
								Keine Mitglieder.
							</TableCell>
						</TableRow>
					) : (
						table.getRowModel().rows.map((row) => (
							<TableRow key={row.id}>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id} className="p-1 align-middle">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
