"use client";

import {
	AlertTriangle,
	Download,
	Link2,
	Mail,
	Pencil,
	Plus,
	Trash2,
	Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { downloadBase64, fileToBase64, XLSX_MIME } from "~/lib/file-download";
import {
	deleteMember,
	type MemberListItem,
	setAddressNeedsUpdate,
} from "~/server/actions/members/members";
import {
	exportMembersXlsx,
	importMembersXlsx,
} from "~/server/actions/members/membersExcel";
import { MemberDialog } from "./MemberDialog";
import { formatMemberAddress, MEMBER_STATUS_OPTIONS } from "./member-constants";

export function AdresslistePage({
	members,
	canEdit,
}: {
	members: MemberListItem[];
	canEdit: boolean;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [search, setSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState("alle");
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<MemberListItem | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null);

	const q = search.trim().toLowerCase();
	const filtered = members.filter((m) => {
		if (statusFilter !== "alle" && m.status !== statusFilter) return false;
		if (!q) return true;
		return (
			`${m.lastName} ${m.firstName}`.toLowerCase().includes(q) ||
			(m.email ?? "").toLowerCase().includes(q) ||
			(m.city ?? "").toLowerCase().includes(q)
		);
	});

	const openNew = () => {
		setEditing(null);
		setDialogOpen(true);
	};
	const openEdit = (m: MemberListItem) => {
		setEditing(m);
		setDialogOpen(true);
	};

	const onExport = () => {
		startTransition(async () => {
			const res = await exportMembersXlsx();
			if (res.success && res.base64) {
				downloadBase64(res.base64, res.fileName, XLSX_MIME);
			} else {
				toast.error(res.error ?? "Export fehlgeschlagen");
			}
		});
	};

	const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		const base64 = await fileToBase64(file);
		startTransition(async () => {
			const res = await importMembersXlsx({ base64 });
			if (res.success) {
				toast.success(
					`Import: ${res.created} neu, ${res.updated} aktualisiert, ${res.linked} verknüpft`,
				);
				if (res.skipped > 0) {
					toast.warning(`${res.skipped} Zeilen übersprungen`);
				}
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const toggleVeraltet = (m: MemberListItem) => {
		startTransition(async () => {
			const res = await setAddressNeedsUpdate(m.id, !m.addressNeedsUpdate);
			if (res.success) router.refresh();
			else toast.error(res.error);
		});
	};

	const confirmDelete = () => {
		if (!deleteTarget) return;
		const id = deleteTarget.id;
		setDeleteTarget(null);
		startTransition(async () => {
			const res = await deleteMember(id);
			if (res.success) {
				toast.success("Mitglied gelöscht");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<div className="flex flex-col">
			<SiteHeader title="Adressliste" />
			<div className="space-y-4 p-4 md:p-6">
				<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
					<div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
						<Input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Suche Name, Email, Ort…"
							className="sm:max-w-xs"
						/>
						<Select value={statusFilter} onValueChange={setStatusFilter}>
							<SelectTrigger className="w-full sm:w-[180px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="alle">Alle Status</SelectItem>
								{MEMBER_STATUS_OPTIONS.map((o) => (
									<SelectItem key={o.value} value={o.value}>
										{o.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={onExport}
							disabled={isPending}
						>
							<Download className="mr-1 h-4 w-4" /> Export
						</Button>
						{canEdit && (
							<>
								<Button
									variant="outline"
									size="sm"
									onClick={() => fileInputRef.current?.click()}
									disabled={isPending}
								>
									<Upload className="mr-1 h-4 w-4" /> Import
								</Button>
								<input
									ref={fileInputRef}
									type="file"
									accept=".xlsx"
									className="hidden"
									onChange={onImport}
								/>
								<Button size="sm" onClick={openNew}>
									<Plus className="mr-1 h-4 w-4" /> Mitglied
								</Button>
							</>
						)}
					</div>
				</div>

				<p className="text-muted-foreground text-sm">
					{filtered.length} von {members.length} Mitgliedern
				</p>

				{filtered.length === 0 ? (
					<p className="rounded-md border border-dashed p-8 text-center text-muted-foreground text-sm">
						Keine Mitglieder. Importiere eine Adressliste-Excel oder lege ein
						Mitglied an.
					</p>
				) : (
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{filtered.map((m) => (
							<div key={m.id} className="space-y-2 rounded-lg border p-3">
								<div className="flex items-start justify-between gap-2">
									<div className="min-w-0">
										<div className="font-medium">
											{m.lastName}, {m.firstName}
										</div>
										{m.beitragspflichtig && (
											<div className="text-muted-foreground text-xs">
												beitragspflichtig
											</div>
										)}
									</div>
									<Badge variant="secondary">{m.status}</Badge>
								</div>

								<div className="text-muted-foreground text-sm">
									{formatMemberAddress(m) || "— keine Adresse —"}
								</div>
								{m.email && (
									<div className="flex items-center gap-1 text-muted-foreground text-xs">
										<Mail className="h-3.5 w-3.5" /> {m.email}
									</div>
								)}

								<div className="flex flex-wrap gap-1">
									{m.lettersOptOut && (
										<Badge
											variant="secondary"
											className="bg-blue-100 text-blue-900 hover:bg-blue-100"
										>
											nur Email
										</Badge>
									)}
									{m.addressNeedsUpdate && (
										<Badge
											variant="secondary"
											className="bg-amber-100 text-amber-900 hover:bg-amber-100"
										>
											Adresse veraltet
										</Badge>
									)}
									{m.linked && (
										<Badge variant="outline" className="gap-1">
											<Link2 className="h-3 w-3" /> verknüpft
										</Badge>
									)}
								</div>

								{canEdit && (
									<div className="flex justify-end gap-1 border-t pt-2">
										<Button
											variant="ghost"
											size="sm"
											disabled={isPending}
											onClick={() => toggleVeraltet(m)}
											title="Adresse veraltet umschalten"
										>
											<AlertTriangle className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											disabled={isPending}
											onClick={() => openEdit(m)}
										>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="sm"
											disabled={isPending}
											onClick={() => setDeleteTarget(m)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<MemberDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				member={editing}
				onSaved={() => router.refresh()}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(o) => {
					if (!o) setDeleteTarget(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Mitglied löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleteTarget?.lastName}, {deleteTarget?.firstName} wird gelöscht.
							Nicht möglich, wenn bezahlte Beiträge daran hängen.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete}>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
