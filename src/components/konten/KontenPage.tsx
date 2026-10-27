"use client";

import { Plus } from "lucide-react";
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
import { Button } from "~/components/ui/button";
import {
	createKonto,
	deleteKonto,
	type Konto,
	updateKonto,
} from "~/server/actions/kontos/kontos";
import { KontoCard } from "./KontoCard";
import { emptyForm, type FormState, KontoForm } from "./KontoForm";

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
			paypalLink: konto.paypalLink ?? "",
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
			paypalLink: form.paypalLink.trim() || null,
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
		if (!deleteId) {
			return;
		}
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
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
