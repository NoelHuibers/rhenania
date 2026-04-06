"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { AddDrinkDialog } from "~/components/trinken/getraenkewart/AddDrinkDialog";
import { DrinksTableDesktop } from "~/components/trinken/getraenkewart/DesktopCard";
import { DrinksCardsMobile } from "~/components/trinken/getraenkewart/MobileCard";
import { Button } from "~/components/ui/button";
import { uploadDrinkImage, validateImageFile } from "~/lib/blob-upload";
import {
	type Drink,
	deleteDrink,
	getDrinks,
	toggleDrinkAvailability,
	updateDrink,
} from "~/server/actions/drinks";

export default function GetraenkePage() {
	const [drinks, setDrinks] = useState<Drink[]>([]);
	const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingData, setEditingData] = useState<{
		name: string;
		price: string;
		volume: string;
		kastengroesse: string;
	}>({ name: "", price: "", volume: "", kastengroesse: "" });
	const [isPending, startTransition] = useTransition();
	const [isLoading, setIsLoading] = useState(true);
	const [uploadingImage, setUploadingImage] = useState<string | null>(null);
	const [uploadProgress, setUploadProgress] = useState<number>(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect
	useEffect(() => {
		loadDrinks();
	}, []);

	const loadDrinks = async () => {
		try {
			setIsLoading(true);
			const fetchedDrinks = await getDrinks();
			setDrinks(fetchedDrinks);
		} catch (error) {
			console.error("Error loading drinks:", error);
			toast.error("Fehler beim Laden der Getränke");
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteDrink = (id: string) => {
		startTransition(async () => {
			try {
				const result = await deleteDrink(id);
				if (result.success) {
					toast.success(result.message);
					setDrinks((prev) => prev.filter((drink) => drink.id !== id));
				} else {
					toast.error(result.error || "Fehler beim Löschen");
				}
			} catch (error) {
				console.error("Error deleting drink:", error);
				toast.error("Ein unerwarteter Fehler ist aufgetreten");
			}
		});
	};

	const handleToggleAvailability = (id: string) => {
		startTransition(async () => {
			try {
				const result = await toggleDrinkAvailability(id);
				if (result.success) {
					toast.success(result.message);
					setDrinks((prev) =>
						prev.map((drink) =>
							drink.id === id
								? {
										...drink,
										isCurrentlyAvailable: !drink.isCurrentlyAvailable,
									}
								: drink,
						),
					);
				} else {
					toast.error(result.error || "Fehler beim Ändern der Verfügbarkeit");
				}
			} catch (error) {
				console.error("Error toggling availability:", error);
				toast.error("Ein unerwarteter Fehler ist aufgetreten");
			}
		});
	};

	const handleImageUpdate = async (drinkId: string, file: File) => {
		try {
			validateImageFile(file);

			setUploadingImage(drinkId);
			setUploadProgress(0);

			const pictureUrl = await uploadDrinkImage(file, {
				onProgress: (progress) => {
					setUploadProgress(progress);
				},
			});

			startTransition(async () => {
				try {
					const result = await updateDrink(drinkId, { pictureUrl });

					if (result.success && result.data) {
						toast.success("Bild erfolgreich aktualisiert");

						setDrinks((prev) =>
							prev.map((drink) =>
								// biome-ignore lint/style/noNonNullAssertion: result.data checked above in result.success && result.data
								drink.id === drinkId ? result.data! : drink,
							),
						);
					} else {
						toast.error(result.error || "Fehler beim Aktualisieren des Bildes");
					}
				} catch (error) {
					console.error("Error updating drink with image:", error);
					toast.error("Ein unerwarteter Fehler ist aufgetreten");
				} finally {
					setUploadingImage(null);
					setUploadProgress(0);
				}
			});
		} catch (error) {
			console.error("Error uploading image:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Fehler beim Hochladen des Bildes",
			);
			setUploadingImage(null);
			setUploadProgress(0);
		}
	};

	const startEditing = (drink: Drink) => {
		setEditingId(drink.id);
		setEditingData({
			name: drink.name,
			price: drink.price.toString(),
			volume: drink.volume?.toString() || "",
			kastengroesse: drink.kastengroesse?.toString() || "",
		});
	};

	const cancelEditing = () => {
		setEditingId(null);
		setEditingData({ name: "", price: "", volume: "", kastengroesse: "" });
	};

	const saveEdit = (id: string) => {
		const price = parseFloat(editingData.price);
		const volume = editingData.volume
			? parseFloat(editingData.volume)
			: undefined;
		const kastengroesse = editingData.kastengroesse
			? parseInt(editingData.kastengroesse, 10)
			: undefined;

		if (!editingData.name.trim()) {
			toast.error("Name ist erforderlich");
			return;
		}
		if (Number.isNaN(price) || price <= 0) {
			toast.error("Gültiger Preis ist erforderlich");
			return;
		}
		if (
			editingData.volume &&
			volume !== undefined &&
			(Number.isNaN(volume) || volume <= 0)
		) {
			toast.error("Gültiges Volumen ist erforderlich");
			return;
		}
		if (
			editingData.kastengroesse &&
			kastengroesse !== undefined &&
			(Number.isNaN(kastengroesse) ||
				kastengroesse <= 0 ||
				!Number.isInteger(kastengroesse))
		) {
			toast.error("Gültige Kastengröße (ganze Zahl) ist erforderlich");
			return;
		}

		startTransition(async () => {
			try {
				const updateData: {
					name: string;
					price: number;
					volume?: number;
					kastengroesse?: number;
				} = { name: editingData.name.trim(), price };
				if (volume !== undefined) updateData.volume = volume;
				if (kastengroesse !== undefined)
					updateData.kastengroesse = kastengroesse;

				const result = await updateDrink(id, updateData);
				if (result.success) {
					toast.success(result.message);
					setDrinks((prev) =>
						prev.map((drink) =>
							drink.id === id
								? {
										...drink,
										name: editingData.name.trim(),
										price,
										volume: volume ?? null,
										kastengroesse: kastengroesse ?? null,
									}
								: drink,
						),
					);
					cancelEditing();
				} else {
					toast.error(result.error || "Fehler beim Aktualisieren");
				}
			} catch (error) {
				console.error("Error updating drink:", error);
				toast.error("Ein unerwarteter Fehler ist aufgetreten");
			}
		});
	};

	const handleDrinkAdded = () => {
		loadDrinks();
	};

	if (isLoading) {
		return (
			<div
				className="flex items-center justify-center py-8"
				role="status"
				aria-live="polite"
			>
				<div className="text-muted-foreground">Getränke werden geladen…</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4" aria-busy={isPending}>
			<AddDrinkDialog
				isOpen={isAddDialogOpen}
				onOpenChange={setIsAddDialogOpen}
				onDrinkAdded={handleDrinkAdded}
			/>

			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg">Getränkekarte</h2>
					<p className="text-muted-foreground text-sm" aria-live="polite">
						{drinks.length} {drinks.length === 1 ? "Getränk" : "Getränke"}
					</p>
				</div>
				<Button
					onClick={() => setIsAddDialogOpen(true)}
					disabled={isPending}
					aria-label="Getränk hinzufügen"
				>
					<Plus className="mr-2 h-4 w-4" />
					Getränk hinzufügen
				</Button>
			</div>

			{/* Desktop Table */}
			<div
				className="hidden rounded-md border md:block"
				role="region"
				aria-label="Getränke Tabelle"
			>
				<DrinksTableDesktop
					drinks={drinks}
					editingId={editingId}
					editingData={editingData}
					setEditingData={setEditingData}
					startEditing={startEditing}
					cancelEditing={cancelEditing}
					saveEdit={saveEdit}
					onDelete={handleDeleteDrink}
					onToggleAvailability={handleToggleAvailability}
					onImageUpdate={handleImageUpdate}
					isPending={isPending}
					uploadingImage={uploadingImage}
					uploadProgress={uploadProgress}
				/>
			</div>

			{/* Mobile Cards */}
			<div
				className="md:hidden"
				role="region"
				aria-label="Getränke Liste mobil"
			>
				<DrinksCardsMobile
					drinks={drinks}
					editingId={editingId}
					editingData={editingData}
					setEditingData={setEditingData}
					startEditing={startEditing}
					cancelEditing={cancelEditing}
					saveEdit={saveEdit}
					onDelete={handleDeleteDrink}
					onToggleAvailability={handleToggleAvailability}
					onImageUpdate={handleImageUpdate}
					isPending={isPending}
					uploadingImage={uploadingImage}
					uploadProgress={uploadProgress}
				/>
			</div>
		</div>
	);
}
