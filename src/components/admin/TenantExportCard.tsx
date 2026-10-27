"use client";

import { Download, FileArchive, Loader2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { ConfirmAction } from "~/components/ui/confirm-action";
import { formatDateTime } from "~/lib/format";
import {
	exportTenantData,
	type TenantExportResult,
} from "~/server/actions/admin/export";

type Done = Extract<TenantExportResult, { success: true }>;

const count = (n: number) => n.toLocaleString("de-DE");

/** "Alle Daten exportieren": builds the ZIP and shows its download link. */
export function TenantExportCard() {
	const [isPending, startTransition] = useTransition();
	const [result, setResult] = useState<Done | null>(null);

	const runExport = () => {
		setResult(null);
		startTransition(async () => {
			try {
				const res = await exportTenantData();
				if (res.success) {
					setResult(res);
					toast.success("Export fertig", {
						description: "Der Download-Link steht bereit.",
					});
				} else {
					toast.error("Export fehlgeschlagen", { description: res.error });
				}
			} catch {
				toast.error("Export fehlgeschlagen", {
					description: "Bitte später erneut versuchen.",
				});
			}
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Alle Daten exportieren</CardTitle>
				<CardDescription>
					Ein ZIP-Archiv mit allen Daten eures Corps: eine CSV-Datei je Tabelle,
					die gespeicherten Rechnungen und Belege und eine README.txt, die alles
					erklärt. Der Link ist mindestens 24 Stunden gültig; ältere Exporte
					werden beim nächsten Export gelöscht.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<ConfirmAction
					title="Alle Daten exportieren?"
					description="Das Archiv enthält personenbezogene Daten aller Mitglieder, z. B. Adressen und Bankverbindungen. Wer den Link hat, kann es herunterladen. Das Erstellen kann einige Minuten dauern."
					confirmLabel="Export erstellen"
					destructive={false}
					onConfirm={runExport}
				>
					<Button disabled={isPending}>
						{isPending ? (
							<Loader2 className="animate-spin" aria-hidden="true" />
						) : (
							<FileArchive aria-hidden="true" />
						)}
						{isPending ? "Export läuft …" : "Export erstellen"}
					</Button>
				</ConfirmAction>

				<div aria-live="polite" className="space-y-3 text-sm">
					{isPending && (
						<p className="text-muted-foreground">
							Tabellen und Dateien werden gesammelt. Bitte die Seite geöffnet
							lassen.
						</p>
					)}
					{result && (
						<div className="space-y-3 rounded-lg border p-3">
							<p className="text-muted-foreground">
								Erstellt am {formatDateTime(result.createdAt)}:{" "}
								{count(result.tables)} Tabellen, {count(result.rows)} Zeilen,{" "}
								{count(result.files)} Dateien.
							</p>
							{result.missingFiles > 0 && (
								<p className="flex items-start gap-2 rounded-md bg-warning-muted p-2 text-warning-muted-foreground">
									<TriangleAlert
										className="mt-0.5 size-4 shrink-0"
										aria-hidden="true"
									/>
									{result.missingFiles === 1
										? "1 Datei fehlte im Speicher."
										: `${count(result.missingFiles)} Dateien fehlten im Speicher.`}{" "}
									Welche, steht in der README.txt.
								</p>
							)}
							<Button asChild variant="outline">
								<a href={result.url} download={result.fileName}>
									<Download aria-hidden="true" />
									ZIP herunterladen
								</a>
							</Button>
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
