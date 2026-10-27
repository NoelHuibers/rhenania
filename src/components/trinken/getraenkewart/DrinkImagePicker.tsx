"use client";

import { Upload, X } from "lucide-react";
import Image from "next/image";
import { Button } from "~/components/ui/button";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";

/** Optional drink picture field: file picker, preview and upload progress. */
export function DrinkImagePicker({
	selectedFile,
	previewUrl,
	isSubmitting,
	isUploading,
	uploadProgress,
	onFileSelect,
	onRemoveFile,
}: {
	selectedFile: File | null;
	previewUrl: string | null;
	isSubmitting: boolean;
	isUploading: boolean;
	uploadProgress: number;
	onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
	onRemoveFile: () => void;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor="picture">Bild (optional)</Label>
			{!selectedFile ? (
				<div className="flex items-center gap-2">
					<Input
						id="picture"
						type="file"
						accept="image/jpeg,image/jpg,image/png,image/webp"
						onChange={onFileSelect}
						disabled={isSubmitting}
						className="hidden"
					/>
					<Button
						type="button"
						variant="outline"
						onClick={() => document.getElementById("picture")?.click()}
						disabled={isSubmitting}
						className="w-full"
					>
						<Upload className="mr-2 h-4 w-4" />
						Bild auswählen
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					<div className="flex items-center gap-2 rounded-md border p-2">
						{previewUrl && (
							<Image
								src={previewUrl}
								alt="Vorschau"
								width={64}
								height={64}
								className="flex-shrink-0 rounded-md object-cover"
							/>
						)}
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm">
								{selectedFile.name}
							</p>
							<p className="text-muted-foreground text-xs">
								{(selectedFile.size / 1024 / 1024).toFixed(2)} MB
							</p>
						</div>
						<IconButton
							size="icon-sm"
							label="Ausgewähltes Bild entfernen"
							type="button"
							onClick={onRemoveFile}
							disabled={isSubmitting}
							className="flex-shrink-0"
						>
							<X className="h-4 w-4" />
						</IconButton>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={() => document.getElementById("picture")?.click()}
						disabled={isSubmitting}
						className="w-full"
					>
						<Upload className="mr-2 h-4 w-4" />
						Anderes Bild wählen
					</Button>
					<Input
						id="picture"
						type="file"
						accept="image/jpeg,image/jpg,image/png,image/webp"
						onChange={onFileSelect}
						disabled={isSubmitting}
						className="hidden"
					/>
				</div>
			)}
			{isUploading && (
				<div className="space-y-2">
					<Progress value={uploadProgress} />
					<p className="text-muted-foreground text-sm">
						Bild wird hochgeladen... {Math.round(uploadProgress)}%
					</p>
				</div>
			)}
		</div>
	);
}
