"use client";

import { Upload, X } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTenantSlug } from "~/components/TenantProvider";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { uploadDrinkImage, validateImageFile } from "~/lib/blob-upload";
import { parseDecimalInput } from "~/lib/decimal";
import { addFuchsenItem } from "~/server/actions/fuchsenladen/items";

interface AddFuchsenItemDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onItemAdded: () => void;
}

export function AddFuchsenItemDialog({
	isOpen,
	onOpenChange,
	onItemAdded,
}: AddFuchsenItemDialogProps) {
	const tenantSlug = useTenantSlug();
	const [isPending, startTransition] = useTransition();
	const [isUploading, setIsUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [formData, setFormData] = useState({
		name: "",
		price: "",
		description: "",
		isCurrentlyAvailable: "true",
	});
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	const resetForm = () => {
		setFormData({
			name: "",
			price: "",
			description: "",
			isCurrentlyAvailable: "true",
		});
		setSelectedFile(null);
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setPreviewUrl(null);
		setUploadProgress(0);
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		try {
			validateImageFile(file);
			setSelectedFile(file);
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			setPreviewUrl(URL.createObjectURL(file));
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Fehler bei der Dateiauswahl",
			);
		}
	};

	const removeFile = () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		setSelectedFile(null);
		setPreviewUrl(null);
		const fileInput = document.getElementById(
			"fuchsen-picture",
		) as HTMLInputElement;
		if (fileInput) fileInput.value = "";
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formData.name.trim()) {
			toast.error("Name ist erforderlich");
			return;
		}

		const price = parseDecimalInput(formData.price);
		if (Number.isNaN(price) || price <= 0) {
			toast.error("Gültiger Preis ist erforderlich");
			return;
		}

		try {
			let pictureUrl: string | undefined;
			if (selectedFile) {
				setIsUploading(true);
				setUploadProgress(0);
				try {
					pictureUrl = await uploadDrinkImage(selectedFile, {
						tenantSlug,
						onProgress: setUploadProgress,
					});
				} catch (uploadError) {
					console.error("Error uploading fuchsen image:", uploadError);
					toast.error(
						uploadError instanceof Error
							? uploadError.message
							: "Fehler beim Hochladen des Bildes",
					);
					setIsUploading(false);
					setUploadProgress(0);
					return;
				}
				setIsUploading(false);
			}

			startTransition(async () => {
				try {
					const result = await addFuchsenItem({
						name: formData.name.trim(),
						price,
						description: formData.description.trim() || undefined,
						pictureUrl,
						isCurrentlyAvailable: formData.isCurrentlyAvailable === "true",
					});

					if (result.success) {
						toast.success(result.message);
						onItemAdded();
						onOpenChange(false);
						resetForm();
					} else {
						toast.error(result.error || "Fehler beim Hinzufügen");
					}
				} catch (error) {
					console.error("Error adding fuchsen item:", error);
					toast.error("Ein unerwarteter Fehler ist aufgetreten");
				}
			});
		} catch (error) {
			console.error("Error in form submission:", error);
			toast.error("Ein unerwarteter Fehler ist aufgetreten");
		}
	};

	const isSubmitting = isPending || isUploading;
	const isFormValid =
		formData.name.trim() &&
		formData.price &&
		parseDecimalInput(formData.price) > 0;

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				if (!open && !isSubmitting) resetForm();
				onOpenChange(open);
			}}
		>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[500px]">
				<DialogHeader className="flex-shrink-0">
					<DialogTitle>Neuen Artikel hinzufügen</DialogTitle>
					<DialogDescription>
						Fügen Sie einen neuen Artikel zum Fuchsenladen hinzu.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
					<div className="flex-1 overflow-y-auto px-1">
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="fuchsen-name">Name *</Label>
								<Input
									id="fuchsen-name"
									value={formData.name}
									onChange={(e) =>
										setFormData((p) => ({ ...p, name: e.target.value }))
									}
									placeholder="Artikelname"
									required
									disabled={isSubmitting}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="fuchsen-price">Preis (€) *</Label>
								<Input
									id="fuchsen-price"
									inputMode="decimal"
									value={formData.price}
									onChange={(e) =>
										setFormData((p) => ({ ...p, price: e.target.value }))
									}
									placeholder="0,00"
									required
									disabled={isSubmitting}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="fuchsen-description">Beschreibung</Label>
								<Textarea
									id="fuchsen-description"
									value={formData.description}
									onChange={(e) =>
										setFormData((p) => ({
											...p,
											description: e.target.value,
										}))
									}
									placeholder="Kurze Beschreibung (optional)"
									disabled={isSubmitting}
									rows={2}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="fuchsen-picture">Bild (optional)</Label>
								{!selectedFile ? (
									<div className="flex items-center gap-2">
										<Input
											id="fuchsen-picture"
											type="file"
											accept="image/jpeg,image/jpg,image/png,image/webp"
											onChange={handleFileSelect}
											disabled={isSubmitting}
											className="hidden"
										/>
										<Button
											type="button"
											variant="outline"
											onClick={() =>
												document.getElementById("fuchsen-picture")?.click()
											}
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
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onClick={removeFile}
												disabled={isSubmitting}
												className="flex-shrink-0"
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
										<Input
											id="fuchsen-picture"
											type="file"
											accept="image/jpeg,image/jpg,image/png,image/webp"
											onChange={handleFileSelect}
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

							<div className="grid gap-2">
								<Label htmlFor="fuchsen-availability">Derzeit verfügbar</Label>
								<Select
									value={formData.isCurrentlyAvailable}
									onValueChange={(value) =>
										setFormData((p) => ({
											...p,
											isCurrentlyAvailable: value,
										}))
									}
									disabled={isSubmitting}
								>
									<SelectTrigger id="fuchsen-availability">
										<SelectValue placeholder="Verfügbarkeit auswählen" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="true">Verfügbar</SelectItem>
										<SelectItem value="false">Nicht verfügbar</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>

					<DialogFooter className="flex-shrink-0 gap-2 border-t pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isSubmitting}
							className="flex-1 sm:flex-none"
						>
							Abbrechen
						</Button>
						<Button
							type="submit"
							disabled={!isFormValid || isSubmitting}
							className="flex-1 sm:flex-none"
						>
							{isSubmitting
								? isUploading
									? "Bild wird hochgeladen..."
									: "Wird hinzugefügt..."
								: "Artikel hinzufügen"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
