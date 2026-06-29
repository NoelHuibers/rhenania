"use client";

import { Download, Plus, Upload } from "lucide-react";
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
import { downloadBase64, fileToBase64, XLSX_MIME } from "~/lib/file-download";
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
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editing, setEditing] = useState<MemberListItem | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null);

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
				<div className="flex flex-wrap items-center justify-end gap-2">
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

				<MembersTable
					members={members}
					canEdit={canEdit}
					onEditFull={(m) => {
						setEditing(m);
						setDialogOpen(true);
					}}
					onRequestDelete={(m) => setDeleteTarget(m)}
				/>
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
