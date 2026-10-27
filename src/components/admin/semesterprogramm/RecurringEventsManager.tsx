"use client";

import { Plus, X } from "lucide-react";
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
import { IconButton } from "~/components/ui/icon-button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "~/components/ui/sheet";
import { useIsMobile } from "~/hooks/use-mobile";
import { utcToDateInput, wallClockToUTC } from "~/lib/time";
import { defaultVenueName } from "~/lib/venues";
import {
	createRecurringEvent,
	deleteRecurringEvent,
	generateInstances,
	toggleRecurringEventActive,
	updateRecurringEvent,
} from "~/server/actions/events/recurring";
import type { Venue } from "~/server/actions/venues";
import { RecurringEventCard } from "./RecurringEventCard";
import { RecurringEventForm } from "./RecurringEventForm";
import {
	emptyForm,
	type FormState,
	type RecurringEvent,
} from "./recurring-event-constants";

export function RecurringEventsManager({
	initialRecurringEvents,
	venues,
}: {
	initialRecurringEvents: RecurringEvent[];
	venues: Venue[];
}) {
	const router = useRouter();
	const isMobile = useIsMobile();
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	// New templates start at the tenant's first venue (#36).
	const defaultLocation = defaultVenueName(venues);
	const newForm: FormState = { ...emptyForm, location: defaultLocation };
	const [form, setForm] = useState<FormState>(newForm);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generating, setGenerating] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [generateResult, setGenerateResult] = useState<Record<string, string>>(
		{},
	);

	function openCreate() {
		setForm(newForm);
		setEditingId(null);
		setError(null);
		setShowCreateForm(true);
	}

	function openEdit(r: RecurringEvent) {
		setForm({
			title: r.title,
			description: r.description ?? "",
			location: r.location ?? defaultLocation,
			type: r.type,
			recurrenceType: r.recurrenceType,
			dayOfWeek: String(r.dayOfWeek ?? 1),
			time: r.time,
			isPublic: r.isPublic,
			meetingUrl: r.meetingUrl ?? "",
			startDate: r.startDate ? utcToDateInput(r.startDate) : "",
			endDate: r.endDate ? utcToDateInput(r.endDate) : "",
		});
		setEditingId(r.id);
		setShowCreateForm(false);
		setError(null);
	}

	function closeForm() {
		setShowCreateForm(false);
		setEditingId(null);
		setForm(newForm);
		setError(null);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!form.title) {
			setError("Titel ist ein Pflichtfeld.");
			return;
		}
		if (
			form.recurrenceType === "occ_semester" &&
			(!form.startDate || !form.endDate)
		) {
			setError("Für das oCC-Semester bitte AnCC- und AbCC-Datum angeben.");
			return;
		}
		if (form.recurrenceType === "biweekly" && !form.startDate) {
			setError("Bitte ein Startdatum angeben.");
			return;
		}

		setLoading(true);
		setError(null);

		const input = {
			title: form.title,
			description: form.description || undefined,
			location: form.location || defaultLocation || undefined,
			type: form.type,
			recurrenceType: form.recurrenceType,
			dayOfWeek:
				form.recurrenceType === "biweekly" ? Number(form.dayOfWeek) : undefined,
			time: form.time,
			isPublic: form.isPublic,
			meetingUrl: form.meetingUrl.trim() || null,
			startDate: form.startDate ? wallClockToUTC(form.startDate) : undefined,
			endDate: form.endDate ? wallClockToUTC(form.endDate) : undefined,
		};

		const result = editingId
			? await updateRecurringEvent(editingId, input)
			: await createRecurringEvent(input);

		setLoading(false);
		if (!result.success) {
			setError(result.error ?? "Fehler aufgetreten");
			return;
		}
		closeForm();
		router.refresh();
	}

	async function handleGenerate(id: string) {
		setGenerating(id);
		const result = await generateInstances(id);
		setGenerating(null);
		if (result.success) {
			const msg =
				result.created === 0
					? "Alle Termine bereits vorhanden"
					: `${result.created} Termine erstellt`;
			setGenerateResult((prev) => ({ ...prev, [id]: msg }));
			router.refresh();
			setTimeout(
				() => setGenerateResult((prev) => ({ ...prev, [id]: "" })),
				3000,
			);
		} else {
			setGenerateResult((prev) => ({
				...prev,
				[id]: result.error ?? "Fehler",
			}));
		}
	}

	async function handleToggleActive(id: string) {
		await toggleRecurringEventActive(id);
		router.refresh();
	}

	async function confirmDelete() {
		if (!deleteId) {
			return;
		}
		await deleteRecurringEvent(deleteId);
		setDeleteId(null);
		router.refresh();
	}

	const formProps = {
		form,
		setForm,
		onSubmit: handleSubmit,
		onClose: closeForm,
		isEditing: !!editingId,
		loading,
		error,
		venues,
	};

	const formCard = (
		<Card className="border-primary/30">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm">
					{editingId ? "Vorlage bearbeiten" : "Neue Vorlage"}
				</CardTitle>
				<IconButton label="Formular schließen" onClick={closeForm}>
					<X className="h-4 w-4" />
				</IconButton>
			</CardHeader>
			<CardContent>
				<RecurringEventForm {...formProps} twoCol />
			</CardContent>
		</Card>
	);

	return (
		<>
			{isMobile && (
				<Sheet
					open={showCreateForm || editingId !== null}
					onOpenChange={(open) => {
						if (!open) {
							closeForm();
						}
					}}
				>
					<SheetContent
						side="right"
						className="w-full overflow-y-auto sm:max-w-md"
					>
						<SheetHeader>
							<SheetTitle>
								{editingId ? "Vorlage bearbeiten" : "Neue Vorlage"}
							</SheetTitle>
						</SheetHeader>
						<div className="px-4 pb-4">
							<RecurringEventForm {...formProps} />
						</div>
					</SheetContent>
				</Sheet>
			)}

			<AlertDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Bereits generierte Termine bleiben erhalten. Die Vorlage selbst
							wird unwiderruflich gelöscht.
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

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="font-semibold text-base">Wiederkehrende Termine</h2>
						<p className="text-muted-foreground text-xs">
							Vorlagen für regelmäßige Veranstaltungen — Termine werden daraus
							generiert
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={openCreate}>
						<Plus className="mr-1.5 h-3.5 w-3.5" />
						Vorlage anlegen
					</Button>
				</div>

				{!isMobile && showCreateForm && formCard}

				{initialRecurringEvents.length === 0 && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Noch keine Vorlagen angelegt.
					</p>
				)}

				{initialRecurringEvents.map((r) => (
					<div key={r.id} className="space-y-2">
						<RecurringEventCard
							event={r}
							generating={generating === r.id}
							generateResult={generateResult[r.id]}
							onToggleActive={handleToggleActive}
							onEdit={openEdit}
							onDelete={setDeleteId}
							onGenerate={handleGenerate}
						/>
						{!isMobile && editingId === r.id && formCard}
					</div>
				))}
			</div>
		</>
	);
}
