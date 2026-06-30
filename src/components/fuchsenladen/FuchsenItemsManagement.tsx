"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useTenantSlug } from "~/components/TenantProvider";
import { Button } from "~/components/ui/button";
import { uploadDrinkImage, validateImageFile } from "~/lib/blob-upload";
import {
	deleteFuchsenItem,
	type FuchsenItem,
	getFuchsenItems,
	toggleFuchsenItemAvailability,
	updateFuchsenItem,
} from "~/server/actions/fuchsenladen/items";
import { AddFuchsenItemDialog } from "./AddFuchsenItemDialog";
import { type EditingData, FuchsenItemsTable } from "./FuchsenItemsTable";

export function FuchsenItemsManagement() {
	const tenantSlug = useTenantSlug();
	const [items, setItems] = useState<FuchsenItem[]>([]);
	const [isAddOpen, setIsAddOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingData, setEditingData] = useState<EditingData>({
		name: "",
		price: "",
		description: "",
	});
	const [isPending, startTransition] = useTransition();
	const [isLoading, setIsLoading] = useState(true);
	const [uploadingImage, setUploadingImage] = useState<string | null>(null);
	const [uploadProgress, setUploadProgress] = useState<number>(0);

	const load = async () => {
		try {
			setIsLoading(true);
			const fetched = await getFuchsenItems();
			setItems(fetched);
		} catch (error) {
			console.error("Error loading fuchsen items:", error);
			toast.error("Fehler beim Laden der Artikel");
		} finally {
			setIsLoading(false);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only, adding load causes infinite loop
	useEffect(() => {
		load();
	}, []);

	const handleDelete = (id: string) => {
		startTransition(async () => {
			const result = await deleteFuchsenItem(id);
			if (result.success) {
				toast.success(result.message);
				setItems((prev) => prev.filter((i) => i.id !== id));
			} else {
				toast.error(result.error || "Fehler beim Löschen");
			}
		});
	};

	const handleToggleAvailability = (id: string) => {
		startTransition(async () => {
			const result = await toggleFuchsenItemAvailability(id);
			if (result.success) {
				toast.success(result.message);
				setItems((prev) =>
					prev.map((i) =>
						i.id === id
							? { ...i, isCurrentlyAvailable: !i.isCurrentlyAvailable }
							: i,
					),
				);
			} else {
				toast.error(result.error || "Fehler");
			}
		});
	};

	const handleImageUpdate = async (id: string, file: File) => {
		try {
			validateImageFile(file);
			setUploadingImage(id);
			setUploadProgress(0);

			const pictureUrl = await uploadDrinkImage(file, {
				tenantSlug,
				onProgress: setUploadProgress,
			});

			startTransition(async () => {
				const result = await updateFuchsenItem(id, { pictureUrl });
				if (result.success && result.data) {
					toast.success("Bild erfolgreich aktualisiert");
					setItems((prev) =>
						prev.map((i) => (i.id === id ? (result.data as FuchsenItem) : i)),
					);
				} else {
					toast.error(result.error || "Fehler beim Aktualisieren des Bildes");
				}
				setUploadingImage(null);
				setUploadProgress(0);
			});
		} catch (error) {
			console.error("Error uploading fuchsen image:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Fehler beim Hochladen des Bildes",
			);
			setUploadingImage(null);
			setUploadProgress(0);
		}
	};

	const startEditing = (item: FuchsenItem) => {
		setEditingId(item.id);
		setEditingData({
			name: item.name,
			price: item.price.toString(),
			description: item.description ?? "",
		});
	};

	const cancelEditing = () => {
		setEditingId(null);
		setEditingData({ name: "", price: "", description: "" });
	};

	const saveEdit = (id: string) => {
		const price = parseFloat(editingData.price);
		if (!editingData.name.trim()) {
			toast.error("Name ist erforderlich");
			return;
		}
		if (Number.isNaN(price) || price <= 0) {
			toast.error("Gültiger Preis ist erforderlich");
			return;
		}

		startTransition(async () => {
			const result = await updateFuchsenItem(id, {
				name: editingData.name.trim(),
				price,
				description: editingData.description.trim() || undefined,
			});
			if (result.success) {
				toast.success(result.message);
				setItems((prev) =>
					prev.map((i) =>
						i.id === id
							? {
									...i,
									name: editingData.name.trim(),
									price,
									description: editingData.description.trim() || null,
								}
							: i,
					),
				);
				cancelEditing();
			} else {
				toast.error(result.error || "Fehler beim Aktualisieren");
			}
		});
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<div className="text-muted-foreground">Artikel werden geladen…</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4" aria-busy={isPending}>
			<AddFuchsenItemDialog
				isOpen={isAddOpen}
				onOpenChange={setIsAddOpen}
				onItemAdded={load}
			/>

			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg">Artikel</h2>
					<p className="text-muted-foreground text-sm">
						{items.length} {items.length === 1 ? "Artikel" : "Artikel"}
					</p>
				</div>
				<Button
					onClick={() => setIsAddOpen(true)}
					disabled={isPending}
					aria-label="Artikel hinzufügen"
				>
					<Plus className="mr-2 h-4 w-4" />
					Artikel hinzufügen
				</Button>
			</div>

			<div className="rounded-md border">
				<FuchsenItemsTable
					items={items}
					editingId={editingId}
					editingData={editingData}
					setEditingData={setEditingData}
					startEditing={startEditing}
					cancelEditing={cancelEditing}
					saveEdit={saveEdit}
					onDelete={handleDelete}
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
