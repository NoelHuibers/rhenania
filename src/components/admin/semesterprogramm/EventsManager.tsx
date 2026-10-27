"use client";

import { Plus } from "lucide-react";
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
import { utcToWallClockInput, wallClockToUTC } from "~/lib/time";
import { defaultVenueName } from "~/lib/venues";
import {
	createEvent,
	deleteEvent,
	updateEvent,
} from "~/server/actions/events/events";
import { toggleEventCancelled } from "~/server/actions/events/recurring";
import type { Venue } from "~/server/actions/venues";
import { EventFormCard } from "./EventFormCard";
import { EventRow } from "./EventRow";
import {
	type Event,
	emptyForm,
	type FormState,
} from "./event-constants";
import { RsvpResponsesDialog } from "./RsvpResponsesDialog";

export { TYPE_COLORS } from "./event-constants";

export function EventsManager({
	initialEvents,
	venues,
}: {
	initialEvents: Event[];
	venues: Venue[];
}) {
	const router = useRouter();
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	// New events start at the tenant's first venue (#36).
	const defaultLocation = defaultVenueName(venues);
	const newForm: FormState = { ...emptyForm, location: defaultLocation };
	const [form, setForm] = useState<FormState>(newForm);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [rsvpEvent, setRsvpEvent] = useState<Event | null>(null);

	const upcoming = initialEvents.filter((e) => e.date >= new Date());
	const past = initialEvents.filter((e) => e.date < new Date());

	function openCreate() {
		setForm(newForm);
		setEditingId(null);
		setError(null);
		setShowCreateForm(true);
	}

	function openEdit(event: Event) {
		setForm({
			title: event.title,
			description: event.description ?? "",
			date: utcToWallClockInput(event.date),
			endDate: event.endDate ? utcToWallClockInput(event.endDate) : "",
			location: event.location ?? defaultLocation,
			type: event.type,
			isPublic: event.isPublic,
			rsvpDeadline: event.rsvpDeadline
				? utcToWallClockInput(event.rsvpDeadline)
				: "",
			maxAttendees:
				event.maxAttendees != null ? String(event.maxAttendees) : "",
			meetingUrl: event.meetingUrl ?? "",
		});
		setEditingId(event.id);
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
		if (!form.title || !form.date) {
			setError("Titel und Datum sind Pflichtfelder.");
			return;
		}
		setLoading(true);
		setError(null);

		const parsedMax = form.maxAttendees
			? Number.parseInt(form.maxAttendees, 10)
			: Number.NaN;
		const input = {
			title: form.title,
			description: form.description || undefined,
			date: wallClockToUTC(form.date),
			endDate: form.endDate ? wallClockToUTC(form.endDate) : undefined,
			location: form.location || undefined,
			type: form.type,
			isPublic: form.isPublic,
			rsvpDeadline: form.rsvpDeadline
				? wallClockToUTC(form.rsvpDeadline)
				: null,
			maxAttendees:
				Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null,
			meetingUrl: form.meetingUrl.trim() || null,
		};

		const result = editingId
			? await updateEvent(editingId, input)
			: await createEvent(input);

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
		const result = await deleteEvent(deleteId);
		setDeleteId(null);
		if (result.success) {
			router.refresh();
		}
	}

	async function handleToggleCancel(id: string) {
		await toggleEventCancelled(id);
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

	function renderRow(event: Event, past?: boolean) {
		return (
			<div key={event.id} className="space-y-2">
				<EventRow
					event={event}
					onEdit={openEdit}
					onDelete={setDeleteId}
					onToggleCancel={handleToggleCancel}
					onShowRsvps={setRsvpEvent}
					past={past}
				/>
				{editingId === event.id && <EventFormCard {...formProps} />}
			</div>
		);
	}

	return (
		<>
			<RsvpResponsesDialog
				eventId={rsvpEvent?.id ?? null}
				eventTitle={rsvpEvent?.title ?? ""}
				open={!!rsvpEvent}
				onOpenChange={(open) => !open && setRsvpEvent(null)}
			/>

			<AlertDialog
				open={!!deleteId}
				onOpenChange={(open) => !open && setDeleteId(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Veranstaltung löschen?</AlertDialogTitle>
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

			<div className="space-y-6">
				<div className="flex justify-end">
					<Button onClick={openCreate} className="w-full sm:w-auto">
						<Plus className="mr-2 h-4 w-4" />
						Neue Veranstaltung
					</Button>
				</div>

				{showCreateForm && <EventFormCard {...formProps} />}

				{initialEvents.length === 0 && (
					<p className="py-12 text-center text-muted-foreground">
						Keine Veranstaltungen vorhanden.
					</p>
				)}

				{upcoming.length > 0 && (
					<div className="space-y-3">
						<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							Kommende Veranstaltungen
						</h2>
						{upcoming.map((event) => renderRow(event))}
					</div>
				)}

				{past.length > 0 && (
					<div className="space-y-3">
						<h2 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							Vergangene Veranstaltungen
						</h2>
						{past.map((event) => renderRow(event, true))}
					</div>
				)}
			</div>
		</>
	);
}
