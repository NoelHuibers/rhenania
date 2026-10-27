"use client";

import {
	Download,
	GraduationCap,
	Link2,
	Plus,
	Sprout,
	Upload,
	UserCheck,
	UserMinus,
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
import { Button } from "~/components/ui/button";
import { StatTile } from "~/components/ui/stat-tile";
import { downloadBase64, fileToBase64, XLSX_MIME } from "~/lib/file-download";
import { relinkMemberAccounts } from "~/server/actions/members/linkAccounts";
import {
	deleteMember,
	type MemberListItem,
} from "~/server/actions/members/members";
import {
	exportMembersXlsx,
	importMembersXlsx,
} from "~/server/actions/members/membersExcel";
import { MemberDialog } from "./MemberDialog";
import { MembersTable } from "./MembersTable";
import { memberCategory } from "./member-constants";

export function AdresslistePage({
	members,
	canEdit,
	statusOptions,
}: {
	members: MemberListItem[];
	canEdit: boolean;
	statusOptions?: { value: string; label: string }[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<MemberListItem | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null);

	const total = members.length;
	const counts = { aktive: 0, inaktive: 0, ah: 0, fuchs: 0 };
	for (const m of members) {
		const c = memberCategory(m.status);
		if (c === "aktive") {
			counts.aktive++;
		} else if (c === "inaktive") {
			counts.inaktive++;
		} else if (c === "ah") {
			counts.ah++;
		} else if (c === "fuchs") {
			counts.fuchs++;
		}
	}

	const openNew = () => {
		setEditing(null);
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
		if (!file) {
			return;
		}
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

	const onRelink = () => {
		startTransition(async () => {
			const res = await relinkMemberAccounts();
			if (!res.success) {
				toast.error(res.error);
				return;
			}
			if (res.linked > 0) {
				const names = res.linkedNames.slice(0, 3).join(", ");
				toast.success(
					`${res.linked} ${res.linked === 1 ? "Konto" : "Konten"} verknüpft: ${names}${res.linked > 3 ? ", …" : ""}`,
				);
				router.refresh();
			} else {
				toast.info(
					"Keine neuen Verknüpfungen — alle passenden Accounts sind schon verbunden.",
				);
			}
			if (res.ambiguous > 0) {
				toast.warning(
					`${res.ambiguous} ${res.ambiguous === 1 ? "Eintrag" : "Einträge"} übersprungen: E-Mail passt auf mehrere Accounts/Mitglieder.`,
				);
			}
		});
	};

	const confirmDelete = () => {
		if (!deleteTarget) {
			return;
		}
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
			<SiteHeader title="Adressliste" subtitle={`${total} Mitglieder`} />
			<div className="space-y-6 p-4 md:p-6">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="font-semibold text-xl tracking-tight">
							Mitgliederverzeichnis
						</h2>
						<p className="text-muted-foreground text-sm">
							Kontakt- und Adressdaten aller Mitglieder.
						</p>
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
								<Button
									variant="outline"
									size="sm"
									onClick={onRelink}
									disabled={isPending}
									title="Unverknüpfte Einträge per E-Mail mit App-Accounts verknüpfen"
								>
									<Link2 className="mr-1 h-4 w-4" /> Konten verknüpfen
								</Button>
								<Button size="sm" onClick={openNew}>
									<Plus className="mr-1 h-4 w-4" /> Mitglied
								</Button>
							</>
						)}
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<StatTile
						icon={<GraduationCap />}
						label="Alte Herren"
						value={counts.ah}
					/>
					<StatTile
						icon={<UserMinus />}
						label="Inaktive"
						value={counts.inaktive}
					/>
					<StatTile icon={<UserCheck />} label="Aktive" value={counts.aktive} />
					<StatTile icon={<Sprout />} label="Füchse" value={counts.fuchs} />
				</div>

				<MembersTable
					members={members}
					canEdit={canEdit}
					onEditFull={(m) => {
						setEditing(m);
						setDialogOpen(true);
					}}
					onRequestDelete={(m) => setDeleteTarget(m)}
					statusOptions={statusOptions}
				/>
			</div>

			<MemberDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				member={editing}
				onSaved={() => router.refresh()}
				statusOptions={statusOptions}
			/>

			<AlertDialog
				open={deleteTarget !== null}
				onOpenChange={(o) => {
					if (!o) {
						setDeleteTarget(null);
					}
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
