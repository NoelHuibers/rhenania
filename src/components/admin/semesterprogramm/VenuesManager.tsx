"use client";

import { MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	createVenue,
	deleteVenue,
	type Venue,
	updateVenue,
} from "~/server/actions/venues";

function VenueForm({
	initial,
	onSubmit,
	onClose,
	loading,
	error,
}: {
	initial: { shortName: string; fullAddress: string };
	onSubmit: (shortName: string, fullAddress: string) => void;
	onClose: () => void;
	loading: boolean;
	error: string | null;
}) {
	const [shortName, setShortName] = useState(initial.shortName);
	const [fullAddress, setFullAddress] = useState(initial.fullAddress);

	return (
		<Card className="border-primary/30">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-base">
					{initial.shortName ? "Ort bearbeiten" : "Neuer Ort"}
				</CardTitle>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="h-4 w-4" />
				</Button>
			</CardHeader>
			<CardContent>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						onSubmit(shortName, fullAddress);
					}}
					className="space-y-4"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="v-short">Kurzname *</Label>
							<Input
								id="v-short"
								value={shortName}
								onChange={(e) => setShortName(e.target.value)}
								placeholder="z.B. adH Rhenania"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="v-address">Volle Adresse *</Label>
							<Input
								id="v-address"
								value={fullAddress}
								onChange={(e) => setFullAddress(e.target.value)}
								placeholder="z.B. Relenbergstraße 8, 70174 Stuttgart"
							/>
						</div>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? "Speichern..." : "Speichern"}
						</Button>
						<Button type="button" variant="outline" onClick={onClose}>
							Abbrechen
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

export function VenuesManager({ initialVenues }: { initialVenues: Venue[] }) {
	const router = useRouter();
	const [showCreate, setShowCreate] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function handleCreate(shortName: string, fullAddress: string) {
		setLoading(true);
		setError(null);
		const result = await createVenue(shortName, fullAddress);
		setLoading(false);
		if (!result.success) return setError(result.error ?? "Fehler");
		setShowCreate(false);
		router.refresh();
	}

	async function handleUpdate(shortName: string, fullAddress: string) {
		if (!editingId) return;
		setLoading(true);
		setError(null);
		const result = await updateVenue(editingId, shortName, fullAddress);
		setLoading(false);
		if (!result.success) return setError(result.error ?? "Fehler");
		setEditingId(null);
		router.refresh();
	}

	async function confirmDelete() {
		if (!deleteId) return;
		await deleteVenue(deleteId);
		setDeleteId(null);
		router.refresh();
	}

	return (
		<>
			<AlertDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Ort löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Der Kurzname bleibt in bestehenden Veranstaltungen erhalten,
							wird im Kalender aber nicht mehr aufgelöst.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDelete}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<p className="text-muted-foreground text-sm">
						{initialVenues.length} Orte gespeichert
					</p>
					<Button onClick={() => { setShowCreate(true); setEditingId(null); }}>
						<Plus className="mr-2 h-4 w-4" />
						Neuer Ort
					</Button>
				</div>

				{showCreate && (
					<VenueForm
						initial={{ shortName: "", fullAddress: "" }}
						onSubmit={handleCreate}
						onClose={() => setShowCreate(false)}
						loading={loading}
						error={error}
					/>
				)}

				{initialVenues.length === 0 && !showCreate && (
					<p className="py-12 text-center text-muted-foreground">
						Noch keine Orte angelegt.
					</p>
				)}

				<div className="divide-y rounded-xl border">
					{initialVenues.map((venue) => (
						<div key={venue.id} className="space-y-2">
							{editingId === venue.id ? (
								<div className="p-2">
									<VenueForm
										initial={{ shortName: venue.shortName, fullAddress: venue.fullAddress }}
										onSubmit={handleUpdate}
										onClose={() => setEditingId(null)}
										loading={loading}
										error={error}
									/>
								</div>
							) : (
								<div className="flex items-center justify-between gap-4 px-4 py-3">
									<div className="flex items-center gap-3 min-w-0">
										<MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
										<div className="min-w-0">
											<p className="font-medium text-sm">{venue.shortName}</p>
											<p className="truncate text-muted-foreground text-xs">
												{venue.fullAddress}
											</p>
										</div>
									</div>
									<div className="flex shrink-0 gap-1">
										<Button
											variant="ghost"
											size="icon"
											onClick={() => { setEditingId(venue.id); setShowCreate(false); setError(null); }}
										>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setDeleteId(venue.id)}
											className="text-destructive hover:text-destructive"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		</>
	);
}
