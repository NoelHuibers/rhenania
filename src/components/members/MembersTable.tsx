"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import {
	Cake,
	Link2,
	Mail,
	MapPin,
	Pencil,
	Phone,
	Search,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
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
import { cn } from "~/lib/utils";
import {
	type MemberListItem,
	updateMemberFields,
} from "~/server/actions/members/members";
import { MemberStatusBadge } from "./MemberStatusBadge";
import {
	avatarColorClasses,
	formatMemberAddress,
	MEMBER_STATUS_OPTIONS,
	memberInitials,
} from "./member-constants";

type TextKey =
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

type ColMeta = { thClass?: string; tdClass?: string };

const TEXT_COLS: {
	key: TextKey;
	header: string;
	w: string;
	border?: boolean;
}[] = [
	{ key: "title", header: "Position", w: "min-w-[130px]" },
	{ key: "email", header: "E-Mail", w: "min-w-[210px]", border: true },
	{ key: "email2", header: "E-Mail 2", w: "min-w-[190px]" },
	{ key: "email3", header: "E-Mail 3", w: "min-w-[190px]" },
	{ key: "mobile", header: "Mobil", w: "min-w-[150px]" },
	{ key: "phonePrivate", header: "Tel. privat", w: "min-w-[150px]" },
	{ key: "phonePrivate2", header: "Tel. privat 2", w: "min-w-[150px]" },
	{ key: "phoneWork", header: "Tel. gesch.", w: "min-w-[150px]" },
	{ key: "phoneWork2", header: "Tel. gesch. 2", w: "min-w-[150px]" },
	{ key: "street", header: "Straße", w: "min-w-[190px]", border: true },
	{ key: "houseNumber", header: "Nr.", w: "min-w-[70px]" },
	{ key: "postalCode", header: "PLZ", w: "min-w-[80px]" },
	{ key: "city", header: "Ort", w: "min-w-[150px]" },
	{ key: "country", header: "Land", w: "min-w-[120px]" },
	{ key: "birthday", header: "Geburtstag", w: "min-w-[120px]", border: true },
	{ key: "company", header: "Firma", w: "min-w-[180px]" },
	{ key: "notes", header: "Notizen", w: "min-w-[200px]" },
];

const BOOL_COLS: { key: BoolKey; header: string; border?: boolean }[] = [
	{ key: "lettersOptOut", header: "Nur E-Mail", border: true },
	{ key: "addressNeedsUpdate", header: "Veraltet" },
	{ key: "forwarding", header: "Weiterl." },
];

const INPUT_CLS =
	"w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/25 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent";

const BASE_TH =
	"sticky top-0 z-20 whitespace-nowrap border-border border-b bg-card px-3 py-2.5 text-left align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide";
const BASE_TD = "border-border/50 border-t px-1 py-0.5 align-middle text-sm";

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
			key={value}
			defaultValue={value}
			disabled={disabled}
			onBlur={(e) => {
				const v = e.target.value;
				if (v !== value) onSave(v);
			}}
			className={INPUT_CLS}
		/>
	);
}

function StatusCell({
	value,
	disabled,
	onSave,
}: {
	value: string;
	disabled: boolean;
	onSave: (v: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	if (!disabled && editing) {
		return (
			<input
				// biome-ignore lint/a11y/noAutofocus: focus the cell the user clicked to edit
				autoFocus
				defaultValue={value}
				list="member-status-options"
				onBlur={(e) => {
					setEditing(false);
					const v = e.target.value;
					if (v !== value) onSave(v);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter") e.currentTarget.blur();
					else if (e.key === "Escape") {
						e.currentTarget.value = value;
						setEditing(false);
					}
				}}
				className={INPUT_CLS}
			/>
		);
	}
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => setEditing(true)}
			className="flex w-full items-center px-2 py-1.5 text-left disabled:cursor-default"
		>
			<MemberStatusBadge status={value} />
		</button>
	);
}

function Identity({ m }: { m: MemberListItem }) {
	return (
		<div className="flex items-center gap-2.5 py-1 pr-2 pl-1">
			<Avatar size="sm" className="shrink-0">
				<AvatarFallback
					className={cn(
						"font-semibold text-[11px]",
						avatarColorClasses(m.lastName + m.firstName),
					)}
				>
					{memberInitials(m.firstName, m.lastName)}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<div className="truncate font-medium leading-tight">
					{m.lastName}, {m.firstName}
				</div>
				{m.linked && (
					<span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
						<Link2 className="h-3 w-3" /> Account
					</span>
				)}
			</div>
		</div>
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
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("alle");
	const [, startTransition] = useTransition();

	// Re-seed when the server data changes (import / add / delete refresh).
	useEffect(() => setRows(members), [members]);

	const saveField = (
		id: string,
		key: TextKey | BoolKey | "status",
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

	const statuses = useMemo(
		() => Array.from(new Set(rows.map((r) => r.status))).sort(),
		[rows],
	);

	const visibleRows = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter((r) => {
			if (statusFilter !== "alle" && r.status !== statusFilter) return false;
			if (!q) return true;
			return `${r.lastName} ${r.firstName} ${r.email ?? ""} ${r.city ?? ""} ${r.status}`
				.toLowerCase()
				.includes(q);
		});
	}, [rows, search, statusFilter]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: handlers (saveField/onEditFull/onRequestDelete) are stable across renders
	const columns = useMemo<ColumnDef<MemberListItem>[]>(() => {
		const cols: ColumnDef<MemberListItem>[] = [
			{
				id: "identity",
				header: "Mitglied",
				cell: ({ row }) => <Identity m={row.original} />,
				meta: {
					thClass: "left-0 z-30! min-w-[210px] bg-card",
					tdClass:
						"sticky left-0 z-10 min-w-[210px] bg-card group-hover:bg-muted/40",
				} satisfies ColMeta,
			},
			{
				id: "status",
				header: "Abteilung",
				cell: ({ row }) => (
					<StatusCell
						value={row.original.status}
						disabled={!canEdit}
						onSave={(v) => saveField(row.original.id, "status", v)}
					/>
				),
				meta: {
					thClass: "min-w-[120px]",
					tdClass: "min-w-[120px]",
				} satisfies ColMeta,
			},
		];
		for (const c of TEXT_COLS) {
			const border = c.border ? "border-border/60 border-l" : "";
			cols.push({
				id: c.key,
				header: c.header,
				cell: ({ row }) => (
					<TextCell
						value={(row.original[c.key] as string | null) ?? ""}
						disabled={!canEdit}
						onSave={(v) => saveField(row.original.id, c.key, v)}
					/>
				),
				meta: {
					thClass: cn(c.w, border),
					tdClass: cn(c.w, border),
				} satisfies ColMeta,
			});
		}
		for (const c of BOOL_COLS) {
			const border = c.border ? "border-border/60 border-l" : "";
			cols.push({
				id: c.key,
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
				meta: {
					thClass: cn("text-center!", border),
					tdClass: cn("text-center!", border),
				} satisfies ColMeta,
			});
		}
		cols.push({
			id: "actions",
			header: "",
			cell: ({ row }) =>
				canEdit ? (
					<div className="flex justify-end gap-0.5 px-1">
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							onClick={() => onEditFull(row.original)}
						>
							<Pencil className="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-8 w-8 text-muted-foreground hover:text-destructive"
							onClick={() => onRequestDelete(row.original)}
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				) : null,
			meta: {
				thClass: "right-0 z-30! w-[84px] border-border/60 border-l bg-card",
				tdClass:
					"sticky right-0 z-10 w-[84px] border-border/60 border-l bg-card group-hover:bg-muted/40",
			} satisfies ColMeta,
		});
		return cols;
	}, [canEdit]);

	const table = useReactTable({
		data: visibleRows,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="flex flex-col gap-4 md:min-h-0 md:min-w-0 md:flex-1">
			{/* Toolbar */}
			<div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative w-full sm:max-w-xs">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Suche Name, E-Mail, Ort…"
						className="pl-9"
					/>
				</div>
				<div className="flex items-center gap-2">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
						<SelectTrigger className="w-[170px]">
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
						{visibleRows.length}
						<span className="text-muted-foreground/60"> / {rows.length}</span>
					</span>
				</div>
			</div>

			<datalist id="member-status-options">
				{MEMBER_STATUS_OPTIONS.map((o) => (
					<option key={o.value} value={o.value} />
				))}
			</datalist>

			{/* Mobile: member cards */}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
				{visibleRows.length === 0 ? (
					<p className="col-span-full py-12 text-center text-muted-foreground text-sm">
						Keine Mitglieder gefunden.
					</p>
				) : (
					visibleRows.map((m) => {
						const address = formatMemberAddress(m);
						return (
							<div
								key={m.id}
								className="rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
							>
								<div className="flex items-start gap-3">
									<Avatar size="lg" className="shrink-0">
										<AvatarFallback
											className={cn(
												"font-semibold text-sm",
												avatarColorClasses(m.lastName + m.firstName),
											)}
										>
											{memberInitials(m.firstName, m.lastName)}
										</AvatarFallback>
									</Avatar>
									<div className="min-w-0 flex-1">
										<div className="flex items-start justify-between gap-2">
											<div className="min-w-0">
												<div className="truncate font-semibold">
													{m.lastName}, {m.firstName}
												</div>
												{m.title && (
													<div className="truncate text-muted-foreground text-xs">
														{m.title}
													</div>
												)}
											</div>
											{m.linked && (
												<Link2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
											)}
										</div>
										<div className="mt-1.5">
											<MemberStatusBadge status={m.status} />
										</div>
									</div>
								</div>

								<div className="mt-3 space-y-1.5 text-sm">
									{m.email && (
										<a
											href={`mailto:${m.email}`}
											className="flex items-center gap-2 text-foreground hover:text-primary"
										>
											<Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
											<span className="truncate">{m.email}</span>
										</a>
									)}
									{(m.mobile || m.phonePrivate) && (
										<a
											href={`tel:${m.mobile || m.phonePrivate}`}
											className="flex items-center gap-2 text-foreground hover:text-primary"
										>
											<Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
											<span className="truncate">
												{m.mobile || m.phonePrivate}
											</span>
										</a>
									)}
									{address && (
										<div className="flex items-start gap-2 text-muted-foreground">
											<MapPin className="mt-0.5 h-4 w-4 shrink-0" />
											<span>{address}</span>
										</div>
									)}
									{m.birthday && (
										<div className="flex items-center gap-2 text-muted-foreground">
											<Cake className="h-4 w-4 shrink-0" />
											<span>{m.birthday}</span>
										</div>
									)}
								</div>

								{(m.lettersOptOut || m.addressNeedsUpdate || m.forwarding) && (
									<div className="mt-3 flex flex-wrap gap-1.5">
										{m.addressNeedsUpdate && (
											<Badge
												variant="outline"
												className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300"
											>
												Adresse veraltet
											</Badge>
										)}
										{m.lettersOptOut && (
											<Badge variant="secondary">Nur E-Mail</Badge>
										)}
										{m.forwarding && (
											<Badge variant="outline">Weiterleitung</Badge>
										)}
									</div>
								)}

								{canEdit && (
									<div className="mt-4 flex gap-2">
										<Button
											variant="outline"
											size="sm"
											className="flex-1"
											onClick={() => onEditFull(m)}
										>
											<Pencil className="mr-1 h-4 w-4" /> Bearbeiten
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="text-muted-foreground hover:text-destructive"
											onClick={() => onRequestDelete(m)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								)}
							</div>
						);
					})
				)}
			</div>

			{/* Desktop: editable grid */}
			<div className="hidden overflow-hidden rounded-xl border bg-card shadow-sm md:flex md:min-h-0 md:min-w-0 md:flex-1 md:flex-col">
				<div className="overflow-auto md:min-h-0 md:min-w-0 md:flex-1">
					<table className="w-full border-collapse">
						<thead>
							{table.getHeaderGroups().map((hg) => (
								<tr key={hg.id}>
									{hg.headers.map((h) => {
										const meta = h.column.columnDef.meta as ColMeta | undefined;
										return (
											<th key={h.id} className={cn(BASE_TH, meta?.thClass)}>
												{h.isPlaceholder
													? null
													: flexRender(
															h.column.columnDef.header,
															h.getContext(),
														)}
											</th>
										);
									})}
								</tr>
							))}
						</thead>
						<tbody>
							{table.getRowModel().rows.length === 0 ? (
								<tr>
									<td
										colSpan={columns.length}
										className="h-28 text-center text-muted-foreground text-sm"
									>
										Keine Mitglieder gefunden.
									</td>
								</tr>
							) : (
								table.getRowModel().rows.map((row) => (
									<tr
										key={row.id}
										className="group transition-colors hover:bg-muted/40"
									>
										{row.getVisibleCells().map((cell) => {
											const meta = cell.column.columnDef.meta as
												| ColMeta
												| undefined;
											return (
												<td
													key={cell.id}
													className={cn(BASE_TD, meta?.tdClass)}
												>
													{flexRender(
														cell.column.columnDef.cell,
														cell.getContext(),
													)}
												</td>
											);
										})}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
