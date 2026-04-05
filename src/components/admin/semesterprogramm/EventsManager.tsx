"use client";

import {
	Ban,
	CalendarDays,
	MapPin,
	Pencil,
	Plus,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AcademicDateTimePicker } from "~/components/ui/academic-date-time-picker";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { academicTimeLabel } from "~/lib/academic-time";
import {
	createEvent,
	deleteEvent,
	type EventType,
	updateEvent,
} from "~/server/actions/events/events";
import { toggleEventCancelled } from "~/server/actions/events/recurring";
import type { Venue } from "~/server/actions/venues";
import { LocationCombobox } from "./LocationCombobox";

type Event = {
	id: string;
	title: string;
	description: string | null;
	date: Date;
	endDate: Date | null;
	location: string | null;
	type: EventType;
	isPublic: boolean;
	isCancelled: boolean;
	recurringEventId: string | null;
	createdAt: Date;
};

type FormState = {
	title: string;
	description: string;
	date: string;
	endDate: string;
	location: string;
	type: EventType;
	isPublic: boolean;
};

const DEFAULT_LOCATION = "adH Rhenania";

const emptyForm: FormState = {
	title: "",
	description: "",
	date: "",
	endDate: "",
	location: DEFAULT_LOCATION,
	type: "Intern",
	isPublic: true,
};

export const TYPE_COLORS: Record<EventType, string> = {
	Intern: "bg-blue-100 text-blue-800",
	AHV: "bg-amber-100 text-amber-800",
	oCC: "bg-green-100 text-green-800",
	SC: "bg-purple-100 text-purple-800",
	"Jour Fix": "bg-cyan-100 text-cyan-800",
	Stammtisch: "bg-orange-100 text-orange-800",
	Sonstige: "bg-gray-100 text-gray-800",
};

const EVENT_TYPES: EventType[] = [
	"Intern",
	"AHV",
	"oCC",
	"SC",
	"Jour Fix",
	"Stammtisch",
	"Sonstige",
];

function toInputDate(d: Date) {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDate(d: Date) {
	const datePart = d.toLocaleDateString("de-DE", {
		weekday: "short",
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
	const timePart = academicTimeLabel(d.getHours(), d.getMinutes());
	return `${datePart}, ${timePart}`;
}

// Shared inline form card used both for create (top) and edit (inline below card)
function EventFormCard({
	form,
	setForm,
	onSubmit,
	onClose,
	isEditing,
	loading,
	error,
	venues,
}: {
	form: FormState;
	setForm: React.Dispatch<React.SetStateAction<FormState>>;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
	isEditing: boolean;
	loading: boolean;
	error: string | null;
	venues: Venue[];
}) {
	return (
		<Card className="border-primary/30">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-base">
					{isEditing ? "Veranstaltung bearbeiten" : "Neue Veranstaltung"}
				</CardTitle>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="h-4 w-4" />
				</Button>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="ev-title">Titel *</Label>
							<Input
								id="ev-title"
								value={form.title}
								onChange={(e) =>
									setForm((f) => ({ ...f, title: e.target.value }))
								}
								placeholder="z.B. Sommerfest"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ev-location">Ort</Label>
							<LocationCombobox
								value={form.location}
								onChange={(v) => setForm((f) => ({ ...f, location: v }))}
								venues={venues}
							/>
						</div>
						<div className="space-y-2">
							<Label>Datum & Uhrzeit *</Label>
							<AcademicDateTimePicker
								value={form.date}
								onChange={(v) => setForm((f) => ({ ...f, date: v }))}
							/>
						</div>
						<div className="space-y-2">
							<Label>Ende (optional)</Label>
							<AcademicDateTimePicker
								value={form.endDate}
								onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
								placeholder="Kein Enddatum"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ev-type">Typ</Label>
							<Select
								value={form.type}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, type: v as EventType }))
								}
							>
								<SelectTrigger id="ev-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{EVENT_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{t}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-3 pt-6">
							<Switch
								id="ev-isPublic"
								checked={form.isPublic}
								onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
							/>
							<Label htmlFor="ev-isPublic">Auf Startseite anzeigen</Label>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="ev-description">Beschreibung</Label>
						<Textarea
							id="ev-description"
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
							placeholder="Kurze Beschreibung..."
							rows={3}
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

export function EventsManager({ initialEvents, venues }: { initialEvents: Event[]; venues: Venue[] }) {
	const router = useRouter();
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);

	const upcoming = initialEvents.filter((e) => e.date >= new Date());
	const past = initialEvents.filter((e) => e.date < new Date());

	function openCreate() {
		setForm(emptyForm);
		setEditingId(null);
		setError(null);
		setShowCreateForm(true);
	}

	function openEdit(event: Event) {
		setForm({
			title: event.title,
			description: event.description ?? "",
			date: toInputDate(event.date),
			endDate: event.endDate ? toInputDate(event.endDate) : "",
			location: event.location ?? DEFAULT_LOCATION,
			type: event.type,
			isPublic: event.isPublic,
		});
		setEditingId(event.id);
		setShowCreateForm(false);
		setError(null);
	}

	function closeForm() {
		setShowCreateForm(false);
		setEditingId(null);
		setForm(emptyForm);
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

		const input = {
			title: form.title,
			description: form.description || undefined,
			date: new Date(form.date),
			endDate: form.endDate ? new Date(form.endDate) : undefined,
			location: form.location || undefined,
			type: form.type,
			isPublic: form.isPublic,
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
		if (!deleteId) return;
		const result = await deleteEvent(deleteId);
		setDeleteId(null);
		if (result.success) router.refresh();
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
					past={past}
				/>
				{editingId === event.id && <EventFormCard {...formProps} />}
			</div>
		);
	}

	return (
		<>
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
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							Löschen
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<div className="space-y-6">
				<div className="flex items-center justify-between">
					<p className="text-muted-foreground text-sm">
						{upcoming.length} kommende · {past.length} vergangene
					</p>
					<Button onClick={openCreate}>
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

function EventRow({
	event,
	onEdit,
	onDelete,
	onToggleCancel,
	past,
}: {
	event: Event;
	onEdit: (e: Event) => void;
	onDelete: (id: string) => void;
	onToggleCancel: (id: string) => void;
	past?: boolean;
}) {
	return (
		<Card className={past || event.isCancelled ? "opacity-60" : ""}>
			<CardContent className="flex items-start justify-between gap-4 p-4">
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={`font-medium ${event.isCancelled ? "text-muted-foreground line-through" : ""}`}
						>
							{event.title}
						</span>
						<span
							className={`rounded-full px-2 py-0.5 font-medium text-xs ${TYPE_COLORS[event.type]}`}
						>
							{event.type}
						</span>
						{event.isCancelled && (
							<span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-700 text-xs">
								Abgesagt
							</span>
						)}
						{event.recurringEventId && (
							<span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500 text-xs">
								Wiederkehrend
							</span>
						)}
						{!event.isPublic && (
							<span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 text-xs">
								Intern
							</span>
						)}
					</div>
					<div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
						<span className="flex items-center gap-1">
							<CalendarDays className="h-3.5 w-3.5" />
							{formatDate(event.date)}
						</span>
						{event.location && (
							<span className="flex items-center gap-1">
								<MapPin className="h-3.5 w-3.5" />
								{event.location}
							</span>
						)}
					</div>
					{event.description && (
						<p className="line-clamp-1 text-muted-foreground text-sm">
							{event.description}
						</p>
					)}
				</div>
				<div className="flex shrink-0 gap-1">
					<Button
						variant="ghost"
						size="icon"
						title={event.isCancelled ? "Absage rückgängig" : "Absagen"}
						onClick={() => onToggleCancel(event.id)}
					>
						{event.isCancelled ? (
							<RotateCcw className="h-4 w-4" />
						) : (
							<Ban className="h-4 w-4" />
						)}
					</Button>
					<Button variant="ghost" size="icon" onClick={() => onEdit(event)}>
						<Pencil className="h-4 w-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						onClick={() => onDelete(event.id)}
						className="text-destructive hover:text-destructive"
					>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
