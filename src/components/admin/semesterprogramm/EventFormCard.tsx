"use client";

import { X } from "lucide-react";
import { AcademicDateTimePicker } from "~/components/ui/academic-date-time-picker";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { IconButton } from "~/components/ui/icon-button";
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
import type { EventType } from "~/server/actions/events/events";
import type { Venue } from "~/server/actions/venues";
import { EVENT_TYPES, type FormState } from "./event-constants";
import { LocationCombobox } from "./LocationCombobox";

/** Shared inline form card used both for create (top) and edit (inline below card). */
export function EventFormCard({
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
				<IconButton label="Formular schließen" onClick={onClose}>
					<X className="h-4 w-4" />
				</IconButton>
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
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label>Antwortfrist (optional)</Label>
							<AcademicDateTimePicker
								value={form.rsvpDeadline}
								onChange={(v) => setForm((f) => ({ ...f, rsvpDeadline: v }))}
								placeholder="Keine Frist"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ev-max">Max. Zusagen (optional)</Label>
							<Input
								id="ev-max"
								type="number"
								min={1}
								value={form.maxAttendees}
								onChange={(e) =>
									setForm((f) => ({ ...f, maxAttendees: e.target.value }))
								}
								placeholder="Unbegrenzt"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="ev-meeting">Online-Meeting Link (optional)</Label>
						<Input
							id="ev-meeting"
							type="url"
							value={form.meetingUrl}
							onChange={(e) =>
								setForm((f) => ({ ...f, meetingUrl: e.target.value }))
							}
							placeholder="https://teams.microsoft.com/..."
						/>
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
