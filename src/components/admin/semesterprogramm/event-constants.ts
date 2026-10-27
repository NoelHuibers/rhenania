// Types, defaults and option lists of the event admin screen.

import type { EventType } from "~/server/actions/events/events";

export type Event = {
	id: string;
	title: string;
	description: string | null;
	date: Date;
	endDate: Date | null;
	location: string | null;
	type: EventType;
	isPublic: boolean;
	isCancelled: boolean;
	rsvpDeadline: Date | null;
	maxAttendees: number | null;
	meetingUrl: string | null;
	recurringEventId: string | null;
	createdAt: Date;
	yesCount: number;
	maybeCount: number;
};

export type FormState = {
	title: string;
	description: string;
	date: string;
	endDate: string;
	location: string;
	type: EventType;
	isPublic: boolean;
	rsvpDeadline: string;
	maxAttendees: string;
	meetingUrl: string;
};

export const emptyForm: FormState = {
	title: "",
	description: "",
	date: "",
	endDate: "",
	location: "",
	type: "Intern",
	isPublic: true,
	rsvpDeadline: "",
	maxAttendees: "",
	meetingUrl: "",
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

export const EVENT_TYPES: EventType[] = [
	"Intern",
	"AHV",
	"oCC",
	"SC",
	"Jour Fix",
	"Stammtisch",
	"Sonstige",
];
