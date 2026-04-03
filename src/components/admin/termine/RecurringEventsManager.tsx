"use client";

import { CalendarClock, Pencil, Plus, Power, Trash2, X } from "lucide-react";
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import {
	createRecurringEvent,
	deleteRecurringEvent,
	generateInstances,
	toggleRecurringEventActive,
	updateRecurringEvent,
	type RecurrenceType,
} from "~/server/actions/events/recurring";

type EventType = "Intern" | "AHV" | "oCC" | "SC" | "Jour Fix" | "Stammtisch" | "Sonstige";

type RecurringEvent = {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	type: EventType;
	recurrenceType: RecurrenceType;
	dayOfWeek: number | null;
	time: string;
	isPublic: boolean;
	startDate: Date | null;
	endDate: Date | null;
	isActive: boolean;
};

type FormState = {
	title: string;
	description: string;
	location: string;
	type: EventType;
	recurrenceType: RecurrenceType;
	dayOfWeek: string;
	time: string;
	isPublic: boolean;
	startDate: string;
	endDate: string;
};

const emptyForm: FormState = {
	title: "",
	description: "",
	location: "adH Rhenania",
	type: "Intern",
	recurrenceType: "biweekly",
	dayOfWeek: "1",
	time: "20:00",
	isPublic: true,
	startDate: "",
	endDate: "",
};

const DAY_NAMES = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const EVENT_TYPES: EventType[] = ["Intern", "AHV", "oCC", "SC", "Jour Fix", "Stammtisch", "Sonstige"];

const TYPE_COLORS: Record<EventType, string> = {
	Intern: "bg-blue-100 text-blue-800",
	AHV: "bg-amber-100 text-amber-800",
	oCC: "bg-green-100 text-green-800",
	SC: "bg-purple-100 text-purple-800",
	"Jour Fix": "bg-cyan-100 text-cyan-800",
	Stammtisch: "bg-orange-100 text-orange-800",
	Sonstige: "bg-gray-100 text-gray-800",
};

function formatShortDate(d: Date) {
	return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

function recurrenceSummary(r: RecurringEvent): string {
	switch (r.recurrenceType) {
		case "occ_semester":
			return "AnCC → nummerierte oCCs (Mo) → AbCC";
		case "biweekly": {
			const day = DAY_NAMES[r.dayOfWeek ?? 1] ?? "Montag";
			return `Alle 2 Wochen ${day}s, ${r.time} Uhr`;
		}
		case "monthly_1st_wednesday":
			return `Jeden 1. Mittwoch, ${r.time} Uhr`;
		case "monthly_1st_3rd_wednesday":
			return `Jeden 1. und 3. Mittwoch, ${r.time} Uhr`;
	}
}

export function RecurringEventsManager({
	initialRecurringEvents,
}: {
	initialRecurringEvents: RecurringEvent[];
}) {
	const router = useRouter();
	const [showCreateForm, setShowCreateForm] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>(emptyForm);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [generating, setGenerating] = useState<string | null>(null);
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [generateResult, setGenerateResult] = useState<Record<string, string>>({});

	function openCreate() {
		setForm(emptyForm);
		setEditingId(null);
		setError(null);
		setShowCreateForm(true);
	}

	function openEdit(r: RecurringEvent) {
		setForm({
			title: r.title,
			description: r.description ?? "",
			location: r.location ?? "adH Rhenania",
			type: r.type,
			recurrenceType: r.recurrenceType,
			dayOfWeek: String(r.dayOfWeek ?? 1),
			time: r.time,
			isPublic: r.isPublic,
			startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : "",
			endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : "",
		});
		setEditingId(r.id);
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
		if (!form.title) { setError("Titel ist ein Pflichtfeld."); return; }
		if (form.recurrenceType === "occ_semester" && (!form.startDate || !form.endDate)) {
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
			location: form.location || "adH Rhenania",
			type: form.type,
			recurrenceType: form.recurrenceType,
			dayOfWeek: form.recurrenceType === "biweekly" ? Number(form.dayOfWeek) : undefined,
			time: form.time,
			isPublic: form.isPublic,
			startDate: form.startDate ? new Date(form.startDate) : undefined,
			endDate: form.endDate ? new Date(form.endDate) : undefined,
		};

		const result = editingId
			? await updateRecurringEvent(editingId, input)
			: await createRecurringEvent(input);

		setLoading(false);
		if (!result.success) { setError(result.error ?? "Fehler aufgetreten"); return; }
		closeForm();
		router.refresh();
	}

	async function handleGenerate(id: string) {
		setGenerating(id);
		const result = await generateInstances(id);
		setGenerating(null);
		if (result.success) {
			const msg = result.created === 0 ? "Alle Termine bereits vorhanden" : `${result.created} Termine erstellt`;
			setGenerateResult((prev) => ({ ...prev, [id]: msg }));
			router.refresh();
			setTimeout(() => setGenerateResult((prev) => ({ ...prev, [id]: "" })), 3000);
		} else {
			setGenerateResult((prev) => ({ ...prev, [id]: result.error ?? "Fehler" }));
		}
	}

	async function handleToggleActive(id: string) {
		await toggleRecurringEventActive(id);
		router.refresh();
	}

	async function confirmDelete() {
		if (!deleteId) return;
		await deleteRecurringEvent(deleteId);
		setDeleteId(null);
		router.refresh();
	}

	const isOCC = form.recurrenceType === "occ_semester";
	const isBiweekly = form.recurrenceType === "biweekly";
	const isMonthly =
		form.recurrenceType === "monthly_1st_wednesday" ||
		form.recurrenceType === "monthly_1st_3rd_wednesday";

	const formCard = (
		<Card className="border-primary/30">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-sm">
					{editingId ? "Vorlage bearbeiten" : "Neue Vorlage"}
				</CardTitle>
				<Button variant="ghost" size="icon" onClick={closeForm}>
					<X className="h-4 w-4" />
				</Button>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="r-title">Titel *</Label>
							<Input
								id="r-title"
								value={form.title}
								onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
								placeholder={isOCC ? "oCC" : "z.B. Jour Fix"}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-location">Ort</Label>
							<Input
								id="r-location"
								value={form.location}
								onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-type">Typ</Label>
							<Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as EventType }))}>
								<SelectTrigger id="r-type"><SelectValue /></SelectTrigger>
								<SelectContent>
									{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
						<div className="flex items-center gap-3 pt-6">
							<Switch
								id="r-isPublic"
								checked={form.isPublic}
								onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))}
							/>
							<Label htmlFor="r-isPublic">Auf Startseite anzeigen</Label>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-recurrence">Wiederholung</Label>
							<Select
								value={form.recurrenceType}
								onValueChange={(v) => setForm((f) => ({ ...f, recurrenceType: v as RecurrenceType }))}
							>
								<SelectTrigger id="r-recurrence"><SelectValue /></SelectTrigger>
								<SelectContent>
									<SelectItem value="occ_semester">oCC Semester (AnCC → AbCC)</SelectItem>
									<SelectItem value="biweekly">Alle 2 Wochen</SelectItem>
									<SelectItem value="monthly_1st_wednesday">Jeden 1. Mittwoch</SelectItem>
									<SelectItem value="monthly_1st_3rd_wednesday">Jeden 1. und 3. Mittwoch</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{isOCC && (
							<>
								<div className="space-y-2">
									<Label htmlFor="r-start">
										AnCC Datum *{" "}
										<span className="text-muted-foreground text-xs">(Sonntag 18:00)</span>
									</Label>
									<Input
										id="r-start"
										type="date"
										value={form.startDate}
										onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="r-end">
										AbCC Datum *{" "}
										<span className="text-muted-foreground text-xs">(Sonntag 18:00)</span>
									</Label>
									<Input
										id="r-end"
										type="date"
										value={form.endDate}
										onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
									/>
								</div>
								<div className="col-span-2 rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm">
									System generiert: <strong>AnCC</strong> (So 18:00) →{" "}
									<strong>2. oCC, 3. oCC …</strong> (Mo 20:00) → <strong>AbCC</strong> (So 18:00)
								</div>
							</>
						)}
						{isBiweekly && (
							<>
								<div className="space-y-2">
									<Label htmlFor="r-time">Uhrzeit</Label>
									<Input
										id="r-time"
										type="time"
										value={form.time}
										onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="r-dow">Wochentag</Label>
									<Select value={form.dayOfWeek} onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}>
										<SelectTrigger id="r-dow"><SelectValue /></SelectTrigger>
										<SelectContent>
											{DAY_NAMES.map((name, i) => (
												<SelectItem key={i} value={String(i)}>{name}</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
								<div className="space-y-2">
									<Label htmlFor="r-start-bw">
										Semester Beginn *{" "}
										<span className="text-muted-foreground text-xs">erster Termin</span>
									</Label>
									<Input
										id="r-start-bw"
										type="date"
										value={form.startDate}
										onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="r-end-bw">Semester Ende</Label>
									<Input
										id="r-end-bw"
										type="date"
										value={form.endDate}
										onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
									/>
								</div>
							</>
						)}
						{isMonthly && (
							<>
								<div className="space-y-2">
									<Label htmlFor="r-time-m">Uhrzeit</Label>
									<Input
										id="r-time-m"
										type="time"
										value={form.time}
										onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="r-start-m">Semester Beginn</Label>
									<Input
										id="r-start-m"
										type="date"
										value={form.startDate}
										onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor="r-end-m">Semester Ende</Label>
									<Input
										id="r-end-m"
										type="date"
										value={form.endDate}
										onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
									/>
								</div>
							</>
						)}
					</div>
					<div className="space-y-2">
						<Label htmlFor="r-description">Beschreibung</Label>
						<Textarea
							id="r-description"
							value={form.description}
							onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							rows={2}
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? "Speichern..." : editingId ? "Speichern" : "Erstellen"}
						</Button>
						<Button type="button" variant="outline" onClick={closeForm}>
							Abbrechen
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);

	return (
		<>
			<AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
						<AlertDialogDescription>
							Bereits generierte Termine bleiben erhalten. Die Vorlage selbst wird unwiderruflich gelöscht.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Abbrechen</AlertDialogCancel>
						<AlertDialogAction onClick={confirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
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
							Vorlagen für regelmäßige Veranstaltungen — Termine werden daraus generiert
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={openCreate}>
						<Plus className="mr-1.5 h-3.5 w-3.5" />
						Vorlage anlegen
					</Button>
				</div>

				{showCreateForm && formCard}

				{initialRecurringEvents.length === 0 && !showCreateForm && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						Noch keine Vorlagen angelegt.
					</p>
				)}

				{initialRecurringEvents.map((r) => (
					<div key={r.id} className="space-y-2">
						<Card className={r.isActive ? "" : "opacity-50"}>
							<CardContent className="p-4 space-y-3">
								<div className="flex items-start justify-between gap-3">
									<div className="space-y-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium">{r.title}</span>
											<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[r.type]}`}>
												{r.type}
											</span>
											{!r.isActive && (
												<span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
													Inaktiv
												</span>
											)}
											{!r.isPublic && (
												<span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
													Intern
												</span>
											)}
										</div>
										<p className="flex items-center gap-1.5 text-muted-foreground text-sm">
											<CalendarClock className="h-3.5 w-3.5 shrink-0" />
											{recurrenceSummary(r)}
											{r.location && ` · ${r.location}`}
										</p>
										{(r.startDate || r.endDate) && (
											<p className="text-muted-foreground text-xs">
												{r.startDate && formatShortDate(r.startDate)}
												{r.startDate && r.endDate && " – "}
												{r.endDate && formatShortDate(r.endDate)}
											</p>
										)}
									</div>
									<div className="flex shrink-0 gap-1">
										<Button
											variant="ghost"
											size="icon"
											title={r.isActive ? "Deaktivieren" : "Aktivieren"}
											onClick={() => handleToggleActive(r.id)}
										>
											<Power className="h-4 w-4" />
										</Button>
										<Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
											<Pencil className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => setDeleteId(r.id)}
											className="text-destructive hover:text-destructive"
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>

								{r.isActive && (
									<div className="flex items-center gap-2 border-t pt-2">
										<Button
											size="sm"
											variant="outline"
											className="h-7 text-xs"
											disabled={generating === r.id}
											onClick={() => handleGenerate(r.id)}
										>
											{generating === r.id ? "Generiere..." : "Termine generieren"}
										</Button>
										{generateResult[r.id] && (
											<span className={`text-xs ${generateResult[r.id]?.startsWith("Fehler") ? "text-destructive" : "text-green-600"}`}>
												{generateResult[r.id]}
											</span>
										)}
									</div>
								)}
							</CardContent>
						</Card>
						{editingId === r.id && formCard}
					</div>
				))}
			</div>
		</>
	);
}
