"use client";

import { Check, Edit2, Loader2, Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useTransition } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import type { FuchsenItem } from "~/server/actions/fuchsenladen/items";

export interface EditingData {
	name: string;
	price: string;
	description: string;
}

interface Props {
	items: FuchsenItem[];
	editingId: string | null;
	editingData: EditingData;
	setEditingData: (data: EditingData) => void;
	startEditing: (item: FuchsenItem) => void;
	cancelEditing: () => void;
	saveEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onToggleAvailability: (id: string) => void;
	onImageUpdate: (id: string, file: File) => Promise<void>;
	isPending: boolean;
	uploadingImage: string | null;
	uploadProgress: number;
}

export function FuchsenItemsTable({
	items,
	editingId,
	editingData,
	setEditingData,
	startEditing,
	cancelEditing,
	saveEdit,
	onDelete,
	onToggleAvailability,
	onImageUpdate,
	isPending,
	uploadingImage,
}: Props) {
	const [, startTransition] = useTransition();

	const handleImagePick = (id: string) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "image/jpeg,image/png,image/webp";
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;
			startTransition(async () => {
				await onImageUpdate(id, file);
			});
		};
		input.click();
	};

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-20">Bild</TableHead>
					<TableHead>Name</TableHead>
					<TableHead>Beschreibung</TableHead>
					<TableHead className="text-right">Preis</TableHead>
					<TableHead className="text-center">Verfügbar</TableHead>
					<TableHead className="w-32 text-right">Aktionen</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.length === 0 ? (
					<TableRow>
						<TableCell colSpan={6} className="py-10 text-center">
							<p className="text-muted-foreground">
								Noch keine Artikel im Fuchsenladen
							</p>
						</TableCell>
					</TableRow>
				) : (
					items.map((item) => {
						const isEditing = editingId === item.id;
						const isUploadingThis = uploadingImage === item.id;
						return (
							<TableRow key={item.id}>
								<TableCell>
									<button
										type="button"
										onClick={() => handleImagePick(item.id)}
										disabled={isPending || isUploadingThis}
										className="group relative block h-12 w-12 overflow-hidden rounded-md border bg-muted"
										aria-label="Bild ändern"
									>
										{item.picture ? (
											<Image
												src={item.picture}
												alt={item.name}
												fill
												className="object-cover"
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center">
												<Upload className="h-4 w-4 text-muted-foreground" />
											</div>
										)}
										{isUploadingThis && (
											<div className="absolute inset-0 flex items-center justify-center bg-black/50">
												<Loader2 className="h-4 w-4 animate-spin text-white" />
											</div>
										)}
									</button>
								</TableCell>
								<TableCell className="font-medium">
									{isEditing ? (
										<Input
											value={editingData.name}
											onChange={(e) =>
												setEditingData({
													...editingData,
													name: e.target.value,
												})
											}
										/>
									) : (
										item.name
									)}
								</TableCell>
								<TableCell className="max-w-xs">
									{isEditing ? (
										<Input
											value={editingData.description}
											onChange={(e) =>
												setEditingData({
													...editingData,
													description: e.target.value,
												})
											}
										/>
									) : (
										<span className="line-clamp-2 text-muted-foreground text-sm">
											{item.description || "—"}
										</span>
									)}
								</TableCell>
								<TableCell className="text-right">
									{isEditing ? (
										<Input
											inputMode="decimal"
											value={editingData.price}
											onChange={(e) =>
												setEditingData({
													...editingData,
													price: e.target.value,
												})
											}
											className="text-right"
										/>
									) : (
										`€${item.price.toFixed(2)}`
									)}
								</TableCell>
								<TableCell className="text-center">
									<Switch
										checked={item.isCurrentlyAvailable}
										onCheckedChange={() => onToggleAvailability(item.id)}
										disabled={isPending}
									/>
								</TableCell>
								<TableCell className="text-right">
									{isEditing ? (
										<div className="flex justify-end gap-1">
											<Button
												size="sm"
												variant="default"
												onClick={() => saveEdit(item.id)}
												disabled={isPending}
												aria-label="Speichern"
											>
												<Check className="h-4 w-4" />
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={cancelEditing}
												disabled={isPending}
												aria-label="Abbrechen"
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									) : (
										<div className="flex justify-end gap-1">
											<Button
												size="sm"
												variant="outline"
												onClick={() => startEditing(item)}
												disabled={isPending}
												aria-label="Bearbeiten"
											>
												<Edit2 className="h-4 w-4" />
											</Button>
											<Button
												size="sm"
												variant="outline"
												onClick={() => onDelete(item.id)}
												disabled={isPending}
												aria-label="Löschen"
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										</div>
									)}
								</TableCell>
							</TableRow>
						);
					})
				)}
			</TableBody>
		</Table>
	);
}
