// components/trinken/getraenkewart/AddDrinkDialog.tsx
"use client";

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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { uploadDrinkImage, validateImageFile } from "~/lib/blob-upload";
import { parseDecimalInput } from "~/lib/decimal";
import { addDrink } from "~/server/actions/drinks";
import { DrinkImagePicker } from "./DrinkImagePicker";

interface AddDrinkDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onDrinkAdded: () => void;
}

export function AddDrinkDialog({
	isOpen,
	onOpenChange,
	onDrinkAdded,
}: AddDrinkDialogProps) {
	const tenantSlug = useTenantSlug();
	const [isPending, startTransition] = useTransition();
	const [isUploading, setIsUploading] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [formData, setFormData] = useState({
		name: "",
		price: "",
		volume: "",
		kastengroesse: "",
		isCurrentlyAvailable: "true",
	});
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);

	const resetForm = () => {
		setFormData({
			name: "",
			price: "",
			volume: "",
			kastengroesse: "",
			isCurrentlyAvailable: "true",
		});
		setSelectedFile(null);
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		setPreviewUrl(null);
		setUploadProgress(0);
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) {
			return;
		}

		try {
			validateImageFile(file);
			setSelectedFile(file);

			// Create preview URL
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
			const url = URL.createObjectURL(file);
			setPreviewUrl(url);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Fehler bei der Dateiauswahl",
			);
		}
	};

	const removeFile = () => {
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		setSelectedFile(null);
		setPreviewUrl(null);
		// Reset file input
		const fileInput = document.getElementById("picture") as HTMLInputElement;
		if (fileInput) {
			fileInput.value = "";
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		// Validate required fields
		if (!formData.name.trim()) {
			toast.error("Name ist erforderlich");
			return;
		}

		const price = parseDecimalInput(formData.price);
		if (Number.isNaN(price) || price <= 0) {
			toast.error("Gültiger Preis ist erforderlich");
			return;
		}

		const volume = formData.volume
			? parseDecimalInput(formData.volume)
			: undefined;
		if (
			formData.volume &&
			volume !== undefined &&
			(Number.isNaN(volume) || volume <= 0)
		) {
			toast.error("Gültiges Volumen ist erforderlich");
			return;
		}

		const kastengroesse = formData.kastengroesse
			? parseInt(formData.kastengroesse, 10)
			: undefined;
		if (
			formData.kastengroesse &&
			kastengroesse !== undefined &&
			(Number.isNaN(kastengroesse) ||
				kastengroesse <= 0 ||
				!Number.isInteger(kastengroesse))
		) {
			toast.error("Gültige Kastengröße (ganze Zahl) ist erforderlich");
			return;
		}

		try {
			let pictureUrl: string | undefined;

			// Upload image first if selected
			if (selectedFile) {
				setIsUploading(true);
				setUploadProgress(0);

				try {
					pictureUrl = await uploadDrinkImage(selectedFile, {
						tenantSlug,
						onProgress: (progress) => {
							setUploadProgress(progress);
						},
					});
				} catch (uploadError) {
					console.error("Error uploading image:", uploadError);
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

			// Now save the drink with the image URL
			startTransition(async () => {
				try {
					const result = await addDrink({
						name: formData.name.trim(),
						price,
						volume,
						kastengroesse,
						pictureUrl,
						isCurrentlyAvailable: formData.isCurrentlyAvailable === "true",
					});

					if (result.success) {
						toast.success(result.message);
						onDrinkAdded();
						onOpenChange(false);
						resetForm();
					} else {
						toast.error(result.error || "Fehler beim Hinzufügen des Getränks");
						if (result.details) {
							for (const detail of result.details) {
								toast.error(
									`${detail.path.map(String).join(".")}: ${detail.message}`,
								);
							}
						}
					}
				} catch (error) {
					console.error("Error adding drink:", error);
					toast.error("Ein unerwarteter Fehler ist aufgetreten");
				}
			});
		} catch (error) {
			console.error("Error in form submission:", error);
			toast.error("Ein unerwarteter Fehler ist aufgetreten");
		}
	};

	const handleInputChange = (field: string, value: string) => {
		setFormData((prev) => ({ ...prev, [field]: value }));
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
				if (!open && !isSubmitting) {
					resetForm();
				}
				onOpenChange(open);
			}}
		>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[500px]">
				<DialogHeader className="flex-shrink-0">
					<DialogTitle>Neues Getränk hinzufügen</DialogTitle>
					<DialogDescription>
						Fügen Sie ein neues Getränk zu Ihrer Karte hinzu. Füllen Sie alle
						Details unten aus.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
					<div className="flex-1 overflow-y-auto px-1">
						<div className="grid gap-4 py-4">
							<div className="grid gap-2">
								<Label htmlFor="name">Name *</Label>
								<Input
									id="name"
									value={formData.name}
									onChange={(e) => handleInputChange("name", e.target.value)}
									placeholder="Getränkename eingeben"
									required
									disabled={isSubmitting}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="price">Preis (€) *</Label>
								<Input
									id="price"
									inputMode="decimal"
									value={formData.price}
									onChange={(e) => handleInputChange("price", e.target.value)}
									placeholder="0,00"
									required
									disabled={isSubmitting}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="volume">Volumen (Liter)</Label>
								<Input
									id="volume"
									inputMode="decimal"
									value={formData.volume}
									onChange={(e) => handleInputChange("volume", e.target.value)}
									placeholder="0,33"
									disabled={isSubmitting}
								/>
							</div>

							<div className="grid gap-2">
								<Label htmlFor="kastengroesse">Kastengröße</Label>
								<Input
									id="kastengroesse"
									type="number"
									step="1"
									min="0"
									value={formData.kastengroesse}
									onChange={(e) =>
										handleInputChange("kastengroesse", e.target.value)
									}
									placeholder="z.B. 20"
									disabled={isSubmitting}
								/>
							</div>

							<DrinkImagePicker
								selectedFile={selectedFile}
								previewUrl={previewUrl}
								isSubmitting={isSubmitting}
								isUploading={isUploading}
								uploadProgress={uploadProgress}
								onFileSelect={handleFileSelect}
								onRemoveFile={removeFile}
							/>

							<div className="grid gap-2">
								<Label htmlFor="availability">Derzeit verfügbar</Label>
								<Select
									value={formData.isCurrentlyAvailable}
									onValueChange={(value) =>
										handleInputChange("isCurrentlyAvailable", value)
									}
									disabled={isSubmitting}
								>
									<SelectTrigger id="availability">
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
								: "Getränk hinzufügen"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
