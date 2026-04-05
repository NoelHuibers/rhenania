"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { KASSE_TYPES, type KasseType } from "~/lib/kasse-types";
import {
	createKonto,
	deleteKonto,
	type Konto,
	updateKonto,
} from "~/server/actions/kontos/kontos";

type FormState = {
	kasseType: KasseType;
	iban: string;
	bic: string;
	bankName: string;
	description: string;
	isActive: boolean;
};

const emptyForm: FormState = {
	kasseType: "Getränkekasse",
	iban: "",
	bic: "",
	bankName: "",
	description: "",
	isActive: true,
};

function KontoForm({
	form,
	setForm,
	onSubmit,
	onClose,
	isEditing,
	isAdmin,
	loading,
	error,
}: {
	form: FormState;
	setForm: React.Dispatch<React.SetStateAction<FormState>>;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
	isEditing: boolean;
	isAdmin: boolean;
	loading: boolean;
	error: string | null;
}) {
	return (
		<Card className="border-primary/30">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-base">
					{isEditing ? "Konto bearbeiten" : "Neues Konto"}
				</CardTitle>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="h-4 w-4" />
				</Button>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="k-type">Art der Kasse *</Label>
							<Select
								value={form.kasseType}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, kasseType: v as KasseType }))
								}
								disabled={isEditing && !isAdmin}
							>
								<SelectTrigger id="k-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{KASSE_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{t}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="k-bankName">Bank *</Label>
							<Input
								id="k-bankName"
								value={form.bankName}
								onChange={(e) =>
									setForm((f) => ({ ...f, bankName: e.target.value }))
								}
								placeholder="z. B. Volksbank Stuttgart"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="k-iban">IBAN *</Label>
							<Input
								id="k-iban"
								value={form.iban}
								onChange={(e) =>
									setForm((f) => ({ ...f, iban: e.target.value }))
								}
								placeholder="DE00 0000 0000 0000 0000 00"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="k-bic">BIC *</Label>
							<Input
								id="k-bic"
								value={form.bic}
								onChange={(e) =>
									setForm((f) => ({ ...f, bic: e.target.value }))
								}
								placeholder="VOBADE21XXX"
							/>
						</div>
						<div className="flex items-center gap-3 pt-6">
							<Switch
								id="k-active"
								checked={form.isActive}
								onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
							/>
							<Label htmlFor="k-active">Aktiv</Label>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="k-description">Beschreibung</Label>
						<Textarea
							id="k-description"
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
							placeholder="Verwendungszweck..."
							rows={2}
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? "Speichern..." : isEditing ? "Speichern" : "Erstellen"}
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

function KontoCard({
	konto,
	isAdmin,
	onEdit,
	onDelete,
}: {
	konto: Konto;
	isAdmin: boolean;
	onEdit: (k: Konto) => void;
	onDelete: (id: string) => void;
}) {
	const formatted = (raw: string) => raw.replace(/(.{4})/g, "$1 ").trim();

	return (
		<Card className={konto.isActive ? "" : "opacity-60"}>
			<CardContent className="flex items-start justify-between gap-4 p-4">
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium">{konto.kasseType}</span>
						{!konto.isActive && (
							<Badge variant="outline" className="text-muted-foreground">
								Inaktiv
							</Badge>
						)}
					</div>
					<p className="font-mono text-muted-foreground text-sm">
						{formatted(konto.iban)}
					</p>
					<p className="text-muted-foreground text-sm">
						BIC: {konto.bic} · {konto.bankName}
					</p>
					{konto.description && (
						<p className="text-muted-foreground text-sm">{konto.description}</p>
					)}
				</div>
				<div className="flex shrink-0 gap-1">
					<Button variant="ghost" size="icon" onClick={() => onEdit(konto)}>
						<Pencil className="h-4 w-4" />
					</Button>
					{isAdmin && (
						<Button
							variant="ghost"
							size="icon"
							onClick={() => onDelete(konto.id)}
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}

export function KontenPage({
	initialKontos,
	isAdmin,
}: {
	initialKontos: Konto[];
	isAdmin: boolean;
}) {
	const router = useRouter();
	const [showCreate, setShowCreate] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	function openCreate() {
		setForm(emptyForm);
		setEditingId(null);
		setError(null);
		setShowCreate(true);
	}

	function openEdit(konto: Konto) {
		setForm({
			kasseType: konto.kasseType,
			iban: konto.iban,
			bic: konto.bic,
			bankName: konto.bankName,
			description: konto.description ?? "",
			isActive: konto.isActive,
		});
		setEditingId(konto.id);
		setShowCreate(false);
		setError(null);
	}

	function closeForm() {
		setShowCreate(false);
		setEditingId(null);
		setForm(emptyForm);
		setError(null);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.iban || !form.bic || !form.bankName) {
			setError("IBAN, BIC und Bank sind Pflichtfelder.");
			return;
		}
		setLoading(true);
		setError(null);

		const input = {
			kasseType: form.kasseType,
			iban: form.iban.replace(/\s/g, ""),
			bic: form.bic,
			bankName: form.bankName,
			description: form.description || undefined,
			isActive: form.isActive,
		};

		const result = editingId
			? await updateKonto(editingId, input)
			: await createKonto(input);

		setLoading(false);
		if (!result.success) {
			setError(result.error ?? "Fehler aufgetreten");
			return;
		}
		closeForm();
		router.refresh();
	}

	async function confirmDelete() {
		if (!deleteId) return;
		await deleteKonto(deleteId);
		setDeleteId(null);
		router.refresh();
	}

	const formProps = {
		form,
		setForm,
		onSubmit: handleSubmit,
		onClose: closeForm,
		isEditing: !!editingId,
		isAdmin,
		loading,
		error,
	};

	return (
		<>
			<AlertDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Konto löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Diese Aktion kann nicht rückgängig gemacht werden.
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

			<div className="min-h-screen bg-background">
				<SiteHeader title="Konten" />
				<div className="container mx-auto max-w-3xl space-y-6 p-4">
					<div className="flex items-center justify-between">
						<p className="text-muted-foreground text-sm">
							{initialKontos.length}{" "}
							{initialKontos.length === 1 ? "Konto" : "Konten"}
						</p>
						{isAdmin && (
							<Button onClick={openCreate}>
								<Plus className="mr-2 h-4 w-4" />
								Neues Konto
							</Button>
						)}
					</div>

					{showCreate && <KontoForm {...formProps} />}

					{initialKontos.length === 0 && (
						<p className="py-12 text-center text-muted-foreground">
							Keine Konten vorhanden.
						</p>
					)}

					<div className="space-y-3">
						{initialKontos.map((konto) => (
							<div key={konto.id} className="space-y-2">
								<KontoCard
									konto={konto}
									isAdmin={isAdmin}
									onEdit={openEdit}
									onDelete={setDeleteId}
								/>
								{editingId === konto.id && <KontoForm {...formProps} />}
							</div>
						))}
					</div>
				</div>
			</div>
		</>
	);
}
