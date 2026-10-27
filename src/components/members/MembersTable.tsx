"use client";

import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import {
	Cake,
	ChevronLeft,
	ChevronRight,
	Link2,
	Mail,
	MapPin,
	Pencil,
	Phone,
	Search,
	SlidersHorizontal,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	useTransition,
} from "react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { StatusBadge } from "~/components/ui/status-badge";
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
import {
	BOOL_COLS,
	type CellValue,
	type Change,
	cellId,
	cellLabel,
	type EditableKey,
	failedMessage,
	inverse,
	leftUnsavedMessage,
	memberName,
	patchesByMember,
	pendingMessage,
	STATUS_COLUMN,
	savedMessage,
	TEXT_COLS,
	withDraft,
	withoutDrafts,
} from "./member-edits";

type ColMeta = { thClass?: string; tdClass?: string };

/** How long "Rückgängig" stays available after a save. */
const UNDO_MS = 10_000;

const INPUT_CLS =
	"w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/25 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent " +
	// Unsaved: amber frame and tint. Saving: dimmed. Failed: red frame.
	"data-[state=dirty]:border-warning-muted-foreground data-[state=dirty]:bg-warning-muted data-[state=saving]:opacity-60 aria-invalid:border-destructive aria-invalid:bg-danger-muted";

const BASE_TH =
	"sticky top-0 z-20 whitespace-nowrap border-border border-b bg-card px-3 py-2.5 text-left align-middle font-medium text-muted-foreground text-xs uppercase tracking-wide";
const BASE_TD = "border-border/50 border-t px-1 py-0.5 align-middle text-sm";

type CellStatus = "saving" | { error: string } | undefined;

/** Props every editable cell gets from the table. */
type CellProps = {
	/** The saved value. */
	value: string;
	/** An unsaved value, if the cell was edited and left. */
	draft: string | undefined;
	label: string;
	column: EditableKey;
	disabled: boolean;
	status: CellStatus;
	describedBy: { dirty: string; error: string };
	onCommit: (text: string) => void;
	onLeave: (text: string) => void;
	onRevert: () => void;
};

/** Moves focus to the same column in the row above or below. */
function focusSibling(from: HTMLElement, dir: -1 | 1) {
	const row = from.closest("tr");
	const col = from.dataset.col;
	const next =
		dir === -1 ? row?.previousElementSibling : row?.nextElementSibling;
	next?.querySelector<HTMLElement>(`[data-col="${col}"]`)?.focus();
}

function cellState(dirty: boolean, status: CellStatus) {
	if (status === "saving") {
		return "saving";
	}
	return dirty ? "dirty" : undefined;
}

/**
 * A text cell. Typing only changes the cell; Enter saves it, Escape puts
 * the saved value back, and leaving it keeps the edit as an unsaved draft
 * (marked, and listed in the save bar) instead of saving silently.
 */
function TextCell({
	value,
	draft,
	label,
	column,
	disabled,
	status,
	describedBy,
	onCommit,
	onLeave,
	onRevert,
	list,
	autoFocus,
	onClose,
}: CellProps & {
	list?: string;
	autoFocus?: boolean;
	/** For cells that are only an input while editing (status). */
	onClose?: (how: "commit" | "revert" | "leave") => void;
}) {
	const external = draft ?? value;
	const [text, setText] = useState(external);
	const [seen, setSeen] = useState(external);
	// A save, a discard or fresh server data replaces what the cell shows.
	if (external !== seen) {
		setSeen(external);
		setText(external);
	}
	const dirty = text !== value;
	const error = typeof status === "object" ? status.error : undefined;
	// Set once Enter or Escape closed a status editor: some browsers fire
	// blur while removing the input, which must not re-add the edit.
	const closed = useRef(false);
	const close = (how: "commit" | "revert") => {
		if (onClose) {
			closed.current = true;
			onClose(how);
		}
	};

	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: the status cell opens on request and takes focus
			autoFocus={autoFocus}
			value={text}
			disabled={disabled}
			list={list}
			aria-label={label}
			aria-invalid={error ? true : undefined}
			aria-busy={status === "saving" || undefined}
			aria-describedby={
				error ? describedBy.error : dirty ? describedBy.dirty : undefined
			}
			data-col={column}
			data-state={cellState(dirty, status)}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => {
				if (closed.current) {
					return;
				}
				onLeave(text);
				onClose?.("leave");
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					// Back at the saved value: nothing to save, drop any draft.
					if (dirty) {
						onCommit(text);
					} else {
						onRevert();
					}
					close("commit");
				} else if (e.key === "Escape") {
					if (dirty || onClose) {
						e.preventDefault();
						setText(value);
						onRevert();
						close("revert");
					}
				} else if (
					(e.key === "ArrowUp" || e.key === "ArrowDown") &&
					!list &&
					!e.altKey &&
					!e.shiftKey
				) {
					e.preventDefault();
					focusSibling(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
				}
			}}
			className={INPUT_CLS}
		/>
	);
}

/** The Abteilung shows as a badge; activating it opens a text field. */
function StatusCell(props: CellProps) {
	const { value, draft, label, disabled, status } = props;
	const [editing, setEditing] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const refocus = useRef(false);
	const shown = draft ?? value;
	const error = typeof status === "object" ? status.error : undefined;

	useEffect(() => {
		if (!editing && refocus.current) {
			refocus.current = false;
			buttonRef.current?.focus();
		}
	}, [editing]);

	if (!disabled && editing) {
		return (
			<TextCell
				{...props}
				list="member-status-options"
				autoFocus
				onClose={(how) => {
					// Enter and Escape return focus to the badge; leaving does not.
					if (how !== "leave") {
						refocus.current = true;
					}
					setEditing(false);
				}}
			/>
		);
	}
	return (
		<button
			ref={buttonRef}
			type="button"
			disabled={disabled}
			data-col={props.column}
			// The badge text is part of the name (WCAG 2.5.3).
			aria-label={`${label}: ${shown || "leer"}`}
			aria-invalid={error ? true : undefined}
			aria-describedby={
				error
					? props.describedBy.error
					: draft !== undefined
						? props.describedBy.dirty
						: undefined
			}
			onClick={() => setEditing(true)}
			onKeyDown={(e) => {
				if (e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault();
					focusSibling(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
				}
			}}
			className={cn(
				"flex w-full items-center rounded-md border border-transparent px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
				draft !== undefined &&
					"border-warning-muted-foreground bg-warning-muted",
				error && "border-destructive",
				status === "saving" && "opacity-60",
			)}
		>
			<MemberStatusBadge status={shown} />
		</button>
	);
}

function Identity({ m }: { m: MemberListItem }) {
	return (
		<div className="flex items-center gap-2.5 py-1 pr-2 pl-1">
			<Avatar size="sm" className="shrink-0" aria-hidden="true">
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
					{memberName(m)}
				</div>
				{m.linked && (
					<span className="mt-0.5 flex items-center gap-1 font-normal text-[11px] text-muted-foreground">
						<Link2 className="h-3 w-3" aria-hidden="true" /> Account
					</span>
				)}
			</div>
		</div>
	);
}

type SaveResult = {
	text: string;
	tone: "success" | "danger";
	/** Offered for UNDO_MS after a successful save. */
	undo?: Change[];
};

export function MembersTable({
	members,
	canEdit,
	onEditFull,
	onRequestDelete,
	statusOptions = MEMBER_STATUS_OPTIONS,
}: {
	members: MemberListItem[];
	canEdit: boolean;
	onEditFull: (m: MemberListItem) => void;
	onRequestDelete: (m: MemberListItem) => void;
	statusOptions?: { value: string; label: string }[];
}) {
	const router = useRouter();
	const ids = {
		hint: useId(),
		dirty: useId(),
		error: useId(),
	};
	const [rows, setRows] = useState(members);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("alle");
	const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
		title: false,
		email2: false,
		email3: false,
		phonePrivate: false,
		phonePrivate2: false,
		phoneWork: false,
		phoneWork2: false,
		houseNumber: false,
		country: false,
		birthday: false,
		company: false,
		notes: false,
	});
	const [drafts, setDrafts] = useState<Record<string, Change>>({});
	const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({});
	const [result, setResult] = useState<SaveResult | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const [, startTransition] = useTransition();
	const scrollRef = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState({ left: false, right: false });

	const updateOverflow = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		setOverflow({
			left: el.scrollLeft > 1,
			right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
		});
	}, []);

	const scrollByX = (dir: 1 | -1) => {
		const el = scrollRef.current;
		if (el) {
			el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
		}
	};

	// Re-seed when the server data changes (save, import, add, delete).
	useEffect(() => setRows(members), [members]);

	// Recompute horizontal overflow when size, data or visible columns change.
	// biome-ignore lint/correctness/useExhaustiveDependencies: deps trigger re-measure
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		updateOverflow();
		const ro = new ResizeObserver(updateOverflow);
		ro.observe(el);
		return () => ro.disconnect();
	}, [updateOverflow, columnVisibility, rows, search, statusFilter]);

	// "Rückgängig" is offered for UNDO_MS after each save.
	useEffect(() => {
		if (!result?.undo) {
			return;
		}
		const t = setTimeout(
			() => setResult((r) => (r?.undo ? { ...r, undo: undefined } : r)),
			UNDO_MS,
		);
		return () => clearTimeout(t);
	}, [result]);

	const pendingCount = Object.keys(drafts).length;

	// Leaving the page would drop unsaved edits: let the browser ask.
	useEffect(() => {
		if (pendingCount === 0) {
			return;
		}
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [pendingCount]);

	const report = (next: SaveResult) => {
		setResult(next);
		setAnnouncement(next.text);
	};

	const save = (changes: Change[], { undo = false } = {}) => {
		if (changes.length === 0) {
			return;
		}
		setDrafts((d) => changes.reduce(withDraft, d));
		setCellStatus((s) => {
			const next = { ...s };
			for (const c of changes) {
				next[cellId(c.id, c.key)] = "saving";
			}
			return next;
		});
		startTransition(async () => {
			const patches = [...patchesByMember(changes)];
			const results = await Promise.all(
				patches.map(async ([id, patch]) => ({
					id,
					res: await updateMemberFields(id, patch).catch(() => ({
						success: false as const,
						error: "Keine Verbindung zum Server.",
					})),
				})),
			);
			const failed = new Map<string, string>();
			let linked = false;
			for (const { id, res } of results) {
				if (res.success) {
					linked ||= Boolean(res.linkedNow);
				} else {
					failed.set(id, res.error);
				}
			}
			const ok = changes.filter((c) => !failed.has(c.id));
			const failures = changes
				.filter((c) => failed.has(c.id))
				.map((change) => ({ change, error: failed.get(change.id) ?? "" }));

			setRows((prev) =>
				prev.map((r) => {
					const mine = ok.filter((c) => c.id === r.id);
					return mine.length === 0
						? r
						: { ...r, ...Object.fromEntries(mine.map((c) => [c.key, c.to])) };
				}),
			);
			setDrafts((d) => withoutDrafts(d, ok));
			setCellStatus((s) => {
				const next = { ...s };
				for (const c of ok) {
					delete next[cellId(c.id, c.key)];
				}
				for (const { change, error } of failures) {
					next[cellId(change.id, change.key)] = { error };
				}
				return next;
			});

			if (failures.length > 0) {
				report({ text: failedMessage(failures), tone: "danger" });
			} else {
				const linkedText = linked
					? " E-Mail passt zu einem App-Account – verknüpft."
					: "";
				report({
					text: savedMessage(ok, undo) + linkedText,
					tone: "success",
					undo: undo ? undefined : ok,
				});
			}
			if (linked) {
				router.refresh();
			}
		});
	};

	const discardAll = () => {
		setDrafts({});
		setCellStatus({});
		setResult(null);
		setAnnouncement("Änderungen verworfen.");
	};

	const change = (
		m: MemberListItem,
		key: EditableKey,
		from: CellValue,
		to: CellValue,
	): Change => ({ id: m.id, key, member: memberName(m), from, to });

	const statuses = useMemo(
		() => Array.from(new Set(rows.map((r) => r.status))).sort(),
		[rows],
	);

	const visibleRows = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter((r) => {
			if (statusFilter !== "alle" && r.status !== statusFilter) {
				return false;
			}
			if (!q) {
				return true;
			}
			return `${r.lastName} ${r.firstName} ${r.email ?? ""} ${r.city ?? ""} ${r.status}`
				.toLowerCase()
				.includes(q);
		});
	}, [rows, search, statusFilter]);

	/** Wiring shared by the text and status cells of one member. */
	const cellProps = (
		m: MemberListItem,
		key: EditableKey,
		column: string,
		value: string,
	): CellProps => {
		const id = cellId(m.id, key);
		const draft = drafts[id]?.to;
		return {
			value,
			draft: typeof draft === "string" ? draft : undefined,
			label: cellLabel(column, m),
			column: key,
			disabled: !canEdit,
			status: cellStatus[id],
			describedBy: { dirty: ids.dirty, error: `${ids.error}-${id}` },
			onCommit: (text) => save([change(m, key, value, text)]),
			onLeave: (text) => {
				const c = change(m, key, value, text);
				const wasDirty = drafts[id]?.to;
				setDrafts((d) => withDraft(d, c));
				if (text !== value && text !== wasDirty) {
					setAnnouncement(leftUnsavedMessage(c));
				}
			},
			onRevert: () => {
				setDrafts((d) => {
					const next = { ...d };
					delete next[id];
					return next;
				});
				setCellStatus((s) => {
					const next = { ...s };
					delete next[id];
					return next;
				});
			},
		};
	};

	const cols: ColumnDef<MemberListItem>[] = [
		{
			id: "identity",
			header: "Mitglied",
			enableHiding: false,
			cell: ({ row }) => <Identity m={row.original} />,
			meta: {
				thClass: "left-0 z-30! min-w-[210px] bg-card",
				tdClass:
					"sticky left-0 z-10 min-w-[210px] bg-card font-normal group-hover:bg-muted/40",
			} satisfies ColMeta,
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
					{...cellProps(
						row.original,
						c.key,
						c.header,
						(row.original[c.key] as string | null) ?? "",
					)}
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
			cell: ({ row }) => {
				const m = row.original;
				const id = cellId(m.id, c.key);
				const saved = Boolean(m[c.key]);
				const draft = drafts[id]?.to;
				const status = cellStatus[id];
				return (
					<div className="flex justify-center">
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
				thClass: cn("text-center!", border),
				tdClass: cn("text-center!", border),
			} satisfies ColMeta,
		});
	}
	cols.push({
		id: "actions",
		header: "Aktionen",
		enableHiding: false,
		cell: ({ row }) =>
			canEdit ? (
				<div className="flex justify-end gap-0.5 px-1">
					<IconButton
						size="icon-sm"
						label={`${memberName(row.original)} bearbeiten`}
						onClick={() => onEditFull(row.original)}
					>
						<Pencil className="h-4 w-4" />
					</IconButton>
					<IconButton
						size="icon-sm"
						label={`${memberName(row.original)} löschen`}
						className="text-muted-foreground hover:text-destructive"
						onClick={() => onRequestDelete(row.original)}
					>
						<Trash2 className="h-4 w-4" />
					</IconButton>
				</div>
			) : null,
		meta: {
			thClass: "right-0 z-30! w-[84px] border-border/60 border-l bg-card",
			tdClass:
				"sticky right-0 z-10 w-[84px] border-border/60 border-l bg-card group-hover:bg-muted/40",
		} satisfies ColMeta,
	});

	const table = useReactTable({
		data: visibleRows,
		columns: cols,
		getRowId: (m) => m.id,
		state: { columnVisibility },
		onColumnVisibilityChange: setColumnVisibility,
		getCoreRowModel: getCoreRowModel(),
	});

	const errors = Object.entries(cellStatus).flatMap(([id, s]) =>
		typeof s === "object" ? [{ id, error: s.error }] : [],
	);
	const saving = Object.values(cellStatus).some((s) => s === "saving");
	const showBar = canEdit && (pendingCount > 0 || result !== null);

	return (
		<div className="space-y-4">
			{/* Toolbar */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="relative w-full sm:max-w-xs">
					<Search
						aria-hidden="true"
						className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Suche Name, E-Mail, Ort…"
						aria-label="Mitglieder suchen"
						className="pl-9"
					/>
				</div>
				<div className="flex items-center gap-2">
					<Select value={statusFilter} onValueChange={setStatusFilter}>
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
							{visibleRows.length}
							<span className="text-muted-foreground/60"> / {rows.length}</span>
						</span>
						<span className="sr-only">
							{visibleRows.length} von {rows.length} Mitgliedern
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
								{table
									.getAllColumns()
									.filter((c) => c.getCanHide())
									.map((c) => (
										<DropdownMenuCheckboxItem
											key={c.id}
											checked={c.getIsVisible()}
											onCheckedChange={(v) => c.toggleVisibility(!!v)}
											onSelect={(e) => e.preventDefault()}
										>
											{String(c.columnDef.header)}
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
									onClick={() => scrollByX(-1)}
								>
									<ChevronLeft className="h-4 w-4" />
								</IconButton>
								<IconButton
									variant="outline"
									size="icon-sm"
									label="Nach rechts scrollen"
									disabled={!overflow.right}
									onClick={() => scrollByX(1)}
								>
									<ChevronRight className="h-4 w-4" />
								</IconButton>
							</>
						)}
					</div>
				</div>
			</div>

			<datalist id="member-status-options">
				{statusOptions.map((o) => (
					<option key={o.value} value={o.value} />
				))}
			</datalist>

			{/* Save results and unsaved edits are announced here (#88). */}
			<div role="status" aria-live="polite" className="sr-only">
				{announcement}
			</div>
			<span id={ids.dirty} hidden>
				Nicht gespeichert
			</span>
			{errors.map((e) => (
				<span key={e.id} id={`${ids.error}-${e.id}`} hidden>
					Nicht gespeichert: {e.error}
				</span>
			))}

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
									<Avatar size="lg" className="shrink-0" aria-hidden="true">
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
													{memberName(m)}
												</div>
												{m.title && (
													<div className="truncate text-muted-foreground text-xs">
														{m.title}
													</div>
												)}
											</div>
											{m.linked && (
												<Link2
													role="img"
													aria-label="Mit App-Account verknüpft"
													className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
												/>
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
											<StatusBadge tone="warning">Adresse veraltet</StatusBadge>
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
											aria-label={`${memberName(m)} bearbeiten`}
										>
											<Pencil className="mr-1 h-4 w-4" /> Bearbeiten
										</Button>
										<IconButton
											label={`${memberName(m)} löschen`}
											className="text-muted-foreground hover:text-destructive"
											onClick={() => onRequestDelete(m)}
										>
											<Trash2 className="h-4 w-4" />
										</IconButton>
									</div>
								)}
							</div>
						);
					})
				)}
			</div>

			{/* Desktop: editable table (horizontal scroll; page scrolls vertically) */}
			<div className="hidden space-y-2 md:block">
				{canEdit && (
					<p id={ids.hint} className="text-muted-foreground text-xs">
						Zelle anklicken und tippen: <kbd>Enter</kbd> speichert,{" "}
						<kbd>Esc</kbd> verwirft, <kbd>↑</kbd>/<kbd>↓</kbd> wechselt die
						Zeile. Nicht gespeicherte Felder sind gelb markiert.
					</p>
				)}
				<div className="overflow-hidden rounded-xl border bg-card shadow-sm">
					<div
						ref={scrollRef}
						onScroll={updateOverflow}
						className="overflow-x-auto"
					>
						<table
							className="w-full border-collapse"
							aria-describedby={canEdit ? ids.hint : undefined}
						>
							<caption className="sr-only">Mitglieder</caption>
							<thead>
								{table.getHeaderGroups().map((hg) => (
									<tr key={hg.id}>
										{hg.headers.map((h) => {
											const meta = h.column.columnDef.meta as
												| ColMeta
												| undefined;
											const actions = h.column.id === "actions";
											return (
												<th
													key={h.id}
													scope="col"
													className={cn(BASE_TH, meta?.thClass)}
												>
													{h.isPlaceholder ? null : actions ? (
														<span className="sr-only">Aktionen</span>
													) : (
														flexRender(
															h.column.columnDef.header,
															h.getContext(),
														)
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
											colSpan={table.getVisibleLeafColumns().length}
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
												const content = flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												);
												// The member column names the row for every cell in it.
												return cell.column.id === "identity" ? (
													<th
														key={cell.id}
														scope="row"
														className={cn(BASE_TD, "text-left", meta?.tdClass)}
													>
														{content}
													</th>
												) : (
													<td
														key={cell.id}
														className={cn(BASE_TD, meta?.tdClass)}
													>
														{content}
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

				{showBar && (
					<SaveBar
						result={result}
						pending={pendingCount}
						saving={saving}
						onSave={() => save(Object.values(drafts))}
						onDiscard={discardAll}
						onUndo={(changes) => save(inverse(changes), { undo: true })}
						onDismiss={() => setResult(null)}
					/>
				)}
			</div>
		</div>
	);
}

/**
 * Floats at the bottom of the screen while there is something to save or
 * a result to show. The text is announced by the status region above, so
 * the bar itself is not a live region.
 */
function SaveBar({
	result,
	pending,
	saving,
	onSave,
	onDiscard,
	onUndo,
	onDismiss,
}: {
	result: SaveResult | null;
	pending: number;
	saving: boolean;
	onSave: () => void;
	onDiscard: () => void;
	onUndo: (changes: Change[]) => void;
	onDismiss: () => void;
}) {
	return (
		<div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
			<div
				data-slot="members-save-bar"
				className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-popover px-4 py-2 text-popover-foreground text-sm shadow-lg"
			>
				{result && (
					<p
						className={cn(
							"min-w-0",
							result.tone === "danger"
								? "text-destructive"
								: "text-muted-foreground",
						)}
					>
						{result.text}
					</p>
				)}
				{result?.undo && (
					<Button
						size="sm"
						variant="outline"
						disabled={saving}
						onClick={() => onUndo(result.undo ?? [])}
					>
						Rückgängig
					</Button>
				)}
				{result && !result.undo && pending === 0 && (
					<Button size="sm" variant="ghost" onClick={onDismiss}>
						Schließen
					</Button>
				)}
				{pending > 0 && (
					<>
						<p className="font-medium">{pendingMessage(pending)}</p>
						<Button
							size="sm"
							variant="ghost"
							disabled={saving}
							onClick={onDiscard}
						>
							Verwerfen
						</Button>
						<Button size="sm" disabled={saving} onClick={onSave}>
							{saving ? "Speichert…" : "Speichern"}
						</Button>
					</>
				)}
			</div>
		</div>
	);
}
