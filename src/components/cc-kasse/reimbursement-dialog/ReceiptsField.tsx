"use client";

import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { validateReceiptFile } from "~/lib/receipt-upload";
import type { ReceiptFile } from "./editing";

/** Receipt list and picker of the reimbursement dialog, with upload progress. */
export function ReceiptsField({
	mode,
	existingReceipts,
	files,
	isSubmitting,
	isUploading,
	progress,
	uploadIndex,
	onAddFiles,
	onRemoveFile,
	onRemoveExisting,
}: {
	mode: "member" | "direct";
	existingReceipts: ReceiptFile[];
	files: File[];
	isSubmitting: boolean;
	isUploading: boolean;
	progress: number;
	uploadIndex: number;
	onAddFiles: (files: File[]) => void;
	onRemoveFile: (idx: number) => void;
	onRemoveExisting: (idx: number) => void;
}) {
	const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
		const selected = Array.from(e.target.files ?? []);
		e.target.value = "";
		const valid: File[] = [];
		for (const f of selected) {
			try {
				validateReceiptFile(f);
				valid.push(f);
			} catch (err) {
				toast.error(
					`${f.name}: ${err instanceof Error ? err.message : "ungültig"}`,
				);
			}
		}
		if (valid.length) {
			onAddFiles(valid);
		}
	};

	return (
		<div className="grid gap-2">
			<Label>Belege (PDF/Bild{mode === "direct" ? ", optional" : ""})</Label>

			{existingReceipts.length > 0 && (
				<div className="space-y-1">
					{existingReceipts.map((r, i) => (
						<div
							key={r.url}
							className="flex items-center gap-2 rounded-md border p-2"
						>
							<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
							<a
								href={r.url}
								target="_blank"
								rel="noopener noreferrer"
								className="min-w-0 flex-1 truncate text-primary text-sm hover:underline"
							>
								{r.name}
							</a>
							<IconButton
								label="Beleg entfernen"
								type="button"
								disabled={isSubmitting}
								onClick={() => onRemoveExisting(i)}
							>
								<X className="h-4 w-4" />
							</IconButton>
						</div>
					))}
				</div>
			)}

			{files.length > 0 && (
				<div className="space-y-1">
					{files.map((f, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: file list is order-stable within the dialog session
							key={`${f.name}-${i}`}
							className="flex items-center gap-2 rounded-md border p-2"
						>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">{f.name}</p>
								<p className="text-muted-foreground text-xs">
									{(f.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
							<IconButton
								label="Datei entfernen"
								type="button"
								disabled={isSubmitting}
								onClick={() => onRemoveFile(i)}
							>
								<X className="h-4 w-4" />
							</IconButton>
						</div>
					))}
				</div>
			)}

			<Input
				id="re-file"
				type="file"
				multiple
				accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
				onChange={handleFiles}
				className="hidden"
			/>
			<Button
				type="button"
				variant="outline"
				onClick={() => document.getElementById("re-file")?.click()}
				disabled={isSubmitting}
				className="w-full"
			>
				<Upload className="mr-2 h-4 w-4" />
				{existingReceipts.length || files.length
					? "Weitere Belege hinzufügen"
					: "Belege auswählen"}
			</Button>
			{isUploading && (
				<div className="space-y-1">
					<Progress value={progress} />
					<p className="text-muted-foreground text-xs">
						Beleg {uploadIndex + 1} von {files.length} wird hochgeladen…{" "}
						{Math.round(progress)}%
					</p>
				</div>
			)}
		</div>
	);
}
