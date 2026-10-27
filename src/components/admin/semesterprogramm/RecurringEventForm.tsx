"use client";

import { Button } from "~/components/ui/button";
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
import type { RecurrenceType } from "~/server/actions/events/recurring";
import type { Venue } from "~/server/actions/venues";
import { LocationCombobox } from "./LocationCombobox";
import {
	DAY_NAMES,
	EVENT_TYPES,
	type EventType,
	type FormState,
} from "./recurring-event-constants";

/** Create/edit form of a recurring-event template, shown in a card or a sheet. */
export function RecurringEventForm({
	form,
	setForm,
	onSubmit,
	onClose,
	isEditing,
	loading,
	error,
	venues,
	twoCol = false,
}: {
	form: FormState;
	setForm: React.Dispatch<React.SetStateAction<FormState>>;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
	isEditing: boolean;
	loading: boolean;
	error: string | null;
	venues: Venue[];
	twoCol?: boolean;
}) {
	const isOCC = form.recurrenceType === "occ_semester";
	const isBiweekly = form.recurrenceType === "biweekly";
	const isMonthly =
		form.recurrenceType === "monthly_1st_wednesday" ||
		form.recurrenceType === "monthly_1st_3rd_wednesday";

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div className={`grid gap-4 ${twoCol ? "sm:grid-cols-2" : ""}`}>
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
					<LocationCombobox
						value={form.location}
						onChange={(v) => setForm((f) => ({ ...f, location: v }))}
						venues={venues}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="r-type">Typ</Label>
					<Select
						value={form.type}
						onValueChange={(v) =>
							setForm((f) => ({ ...f, type: v as EventType }))
						}
					>
						<SelectTrigger id="r-type">
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
						onValueChange={(v) =>
							setForm((f) => ({
								...f,
								recurrenceType: v as RecurrenceType,
							}))
						}
					>
						<SelectTrigger id="r-recurrence">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="occ_semester">
								oCC Semester (AnCC → AbCC)
							</SelectItem>
							<SelectItem value="biweekly">Alle 2 Wochen</SelectItem>
							<SelectItem value="monthly_1st_wednesday">
								Jeden 1. Mittwoch
							</SelectItem>
							<SelectItem value="monthly_1st_3rd_wednesday">
								Jeden 1. und 3. Mittwoch
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{isOCC && (
					<>
						<div className="space-y-2">
							<Label htmlFor="r-start">
								AnCC Datum *{" "}
								<span className="text-muted-foreground text-xs">
									(Sonntag 18:00)
								</span>
							</Label>
							<Input
								id="r-start"
								type="date"
								value={form.startDate}
								onChange={(e) =>
									setForm((f) => ({ ...f, startDate: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-end">
								AbCC Datum *{" "}
								<span className="text-muted-foreground text-xs">
									(Sonntag 18:00)
								</span>
							</Label>
							<Input
								id="r-end"
								type="date"
								value={form.endDate}
								onChange={(e) =>
									setForm((f) => ({ ...f, endDate: e.target.value }))
								}
							/>
						</div>
						<div
							className={`${twoCol ? "col-span-2" : ""} rounded-md border border-green-200 bg-green-50 p-3 text-green-800 text-sm`}
						>
							System generiert: <strong>AnCC</strong> (So 18:00) →{" "}
							<strong>2. oCC, 3. oCC …</strong> (Mo 20:00) →{" "}
							<strong>AbCC</strong> (So 18:00)
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
								onChange={(e) =>
									setForm((f) => ({ ...f, time: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-dow">Wochentag</Label>
							<Select
								value={form.dayOfWeek}
								onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: v }))}
							>
								<SelectTrigger id="r-dow">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{DAY_NAMES.map((name, i) => (
										<SelectItem key={name} value={String(i)}>
											{name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-start-bw">
								Semester Beginn *{" "}
								<span className="text-muted-foreground text-xs">
									erster Termin
								</span>
							</Label>
							<Input
								id="r-start-bw"
								type="date"
								value={form.startDate}
								onChange={(e) =>
									setForm((f) => ({ ...f, startDate: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-end-bw">Semester Ende</Label>
							<Input
								id="r-end-bw"
								type="date"
								value={form.endDate}
								onChange={(e) =>
									setForm((f) => ({ ...f, endDate: e.target.value }))
								}
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
								onChange={(e) =>
									setForm((f) => ({ ...f, time: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-start-m">Semester Beginn</Label>
							<Input
								id="r-start-m"
								type="date"
								value={form.startDate}
								onChange={(e) =>
									setForm((f) => ({ ...f, startDate: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="r-end-m">Semester Ende</Label>
							<Input
								id="r-end-m"
								type="date"
								value={form.endDate}
								onChange={(e) =>
									setForm((f) => ({ ...f, endDate: e.target.value }))
								}
							/>
						</div>
					</>
				)}
			</div>
			<div className="space-y-2">
				<Label htmlFor="r-meeting">Online-Meeting Link (optional)</Label>
				<Input
					id="r-meeting"
					type="url"
					value={form.meetingUrl}
					onChange={(e) =>
						setForm((f) => ({ ...f, meetingUrl: e.target.value }))
					}
					placeholder="https://teams.microsoft.com/..."
				/>
				<p className="text-muted-foreground text-xs">
					Wird auf alle generierten Termine übertragen.
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="r-description">Beschreibung</Label>
				<Textarea
					id="r-description"
					value={form.description}
					onChange={(e) =>
						setForm((f) => ({ ...f, description: e.target.value }))
					}
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
	);
}
