// Types, defaults and labels of the recurring-event templates screen.

import type { RecurrenceType } from "~/server/actions/events/recurring";

// Per-tenant configurable; valid values come from the `event_type` table.
export type EventType = string;

export type RecurringEvent = {
	id: string;
	title: string;
	description: string | null;
	location: string | null;
	type: EventType;
	recurrenceType: RecurrenceType;
	dayOfWeek: number | null;
	time: string;
	isPublic: boolean;
	meetingUrl: string | null;
	startDate: Date | null;
	endDate: Date | null;
	isActive: boolean;
};

export type FormState = {
	title: string;
	description: string;
	location: string;
	type: EventType;
	recurrenceType: RecurrenceType;
	dayOfWeek: string;
	time: string;
	isPublic: boolean;
	meetingUrl: string;
	startDate: string;
	endDate: string;
};

export const emptyForm: FormState = {
	title: "",
	description: "",
	location: "",
	type: "Intern",
	recurrenceType: "biweekly",
	dayOfWeek: "1",
	time: "20:00",
	isPublic: true,
	meetingUrl: "",
	startDate: "",
	endDate: "",
};

export const DAY_NAMES = [
	"Sonntag",
	"Montag",
	"Dienstag",
	"Mittwoch",
	"Donnerstag",
	"Freitag",
	"Samstag",
];
export const EVENT_TYPES: EventType[] = [
	"Intern",
	"AHV",
	"oCC",
	"SC",
	"Jour Fix",
	"Stammtisch",
	"Sonstige",
];

export const TYPE_COLORS: Record<EventType, string> = {
	Intern: "bg-blue-100 text-blue-800",
	AHV: "bg-amber-100 text-amber-800",
	oCC: "bg-green-100 text-green-800",
	SC: "bg-purple-100 text-purple-800",
	"Jour Fix": "bg-cyan-100 text-cyan-800",
	Stammtisch: "bg-orange-100 text-orange-800",
	Sonstige: "bg-gray-100 text-gray-800",
};

export function recurrenceSummary(r: RecurringEvent): string {
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
