"use client";

import type { VisibilityState } from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { DataList } from "~/components/ui/data-list";
import {
	type MemberListItem,
	updateMemberFields,
} from "~/server/actions/members/members";
import type { CellProps, CellStatus } from "./MemberCells";
import { SaveBar, type SaveResult } from "./MembersSaveBar";
import { MembersToolbar } from "./MembersToolbar";
import { memberColumns } from "./member-columns";
import { MEMBER_STATUS_OPTIONS } from "./member-constants";
import {
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
	savedMessage,
	withDraft,
	withoutDrafts,
} from "./member-edits";
import { useHorizontalOverflow } from "./use-horizontal-overflow";

/** How long "Rückgängig" stays available after a save. */
const UNDO_MS = 10_000;

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
	const { scrollRef, overflow, updateOverflow, scrollByX } =
		useHorizontalOverflow([columnVisibility, rows, search, statusFilter]);

	// Re-seed when the server data changes (save, import, add, delete).
	useEffect(() => setRows(members), [members]);

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

	const cols = memberColumns({
		canEdit,
		drafts,
		cellStatus,
		cellProps,
		save,
		change,
		onEditFull,
		onRequestDelete,
	});

	const errors = Object.entries(cellStatus).flatMap(([id, s]) =>
		typeof s === "object" ? [{ id, error: s.error }] : [],
	);
	const saving = Object.values(cellStatus).some((s) => s === "saving");
	const showBar = canEdit && (pendingCount > 0 || result !== null);

	return (
		<div className="space-y-4">
			<MembersToolbar
				search={search}
				onSearchChange={setSearch}
				statusFilter={statusFilter}
				onStatusFilterChange={setStatusFilter}
				statuses={statuses}
				visibleCount={visibleRows.length}
				totalCount={rows.length}
				columns={cols}
				columnVisibility={columnVisibility}
				onColumnVisibilityChange={setColumnVisibility}
				overflow={overflow}
				onScroll={scrollByX}
			/>

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

			{canEdit && (
				<p
					id={ids.hint}
					className="text-muted-foreground text-xs max-md:hidden"
				>
					Zelle anklicken und tippen: <kbd>Enter</kbd> speichert, <kbd>Esc</kbd>{" "}
					verwirft, <kbd>↑</kbd>/<kbd>↓</kbd> wechselt die Zeile. Nicht
					gespeicherte Felder sind gelb markiert.
				</p>
			)}

			{/* One list: an editable table from md up, a card per member below. */}
			<div className="md:overflow-hidden md:rounded-xl md:border md:bg-card md:shadow-sm">
				<DataList
					data={visibleRows}
					columns={cols}
					getRowId={(m) => m.id}
					caption="Mitglieder"
					columnVisibility={columnVisibility}
					empty={
						<p className="py-12 text-center text-muted-foreground text-sm">
							Keine Mitglieder gefunden.
						</p>
					}
					className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					containerProps={{
						ref: scrollRef,
						onScroll: updateOverflow,
						// Wide table: keyboard users can focus the region to scroll
						// it (WCAG 2.1.1).
						tabIndex: 0,
						role: "region",
						"aria-label": "Mitgliedertabelle, seitlich scrollbar",
					}}
					tableProps={{
						className: "border-collapse",
						"aria-describedby": canEdit ? ids.hint : undefined,
					}}
					bodyClassName="sm:max-md:grid-cols-2"
					rowClassName="group hover:bg-muted/40 md:border-b-0 max-md:rounded-xl max-md:p-4 max-md:shadow-sm"
				/>
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
	);
}
