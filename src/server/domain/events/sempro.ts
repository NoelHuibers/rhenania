// sempro.ts — what the Semesterprogramm PDF shows (#33).
//
// The data the PDF layout (./sempro-pdf.tsx) renders, and the pure rules
// that turn the tenant's rows into it: the leaders by rank, the rule texts
// of the recurring events and the semester's last day. The events service
// reads the rows (`semproPdfData`).

import { addDaysInTZ } from "~/lib/time";

export type PDFEvent = {
	date: Date;
	endDate: Date | null;
	title: string;
	location: string | null;
	type: string;
	isPublic: boolean;
	isCancelled: boolean;
};

export type PDFLeader = {
	name: string;
	role: string; // "Senior" | "Consenior" | "Subsenior" | "Fuchsmajor"
};

export type PDFData = {
	semesterName: string;
	startDate: Date;
	endDate: Date;
	leaders: PDFLeader[];
	ccKonto: { iban: string; bic: string; bankName: string } | null;
	jourFixeRule: string | null;
	stammtischRule: string | null;
	events: PDFEvent[];
};

export const RANK_MAP: Record<string, string> = {
	Senior: "x",
	Consenior: "xx",
	Subsenior: "xxx",
	Fuchsmajor: "FM",
};

export const LEADERSHIP_ROLES = [
	"Senior",
	"Consenior",
	"Subsenior",
	"Fuchsmajor",
];

const RECURRENCE_LABELS: Record<string, string> = {
	monthly_1st_3rd_wednesday: "jeden 1. und 3. Mittwoch im Monat",
	monthly_1st_wednesday: "jeden 1. Mittwoch im Monat",
	biweekly: "alle zwei Wochen",
	occ_semester: "nach Semesterplan",
};

/**
 * Berlin midnight of the calendar day after `date`. Steps the calendar day
 * instead of adding 24 hours, so DST days (23 or 25 hours) land correctly.
 */
export function startOfNextBerlinDay(date: Date): Date {
	return addDaysInTZ(date, 1);
}

/** The named leaders, Senior first. */
export function leadersByRank(
	rows: { name: string | null; roleName: string }[],
): PDFLeader[] {
	return rows
		.filter((r) => r.name)
		.map((r) => ({ name: r.name ?? "", role: r.roleName }))
		.sort(
			(a, b) =>
				LEADERSHIP_ROLES.indexOf(a.role) - LEADERSHIP_ROLES.indexOf(b.role),
		);
}

/** The rule text of the first recurring event of `type`, or null. */
export function recurrenceRule(
	templates: { type: string; recurrenceType: string }[],
	type: string,
): string | null {
	const template = templates.find((r) => r.type === type);
	return template ? (RECURRENCE_LABELS[template.recurrenceType] ?? null) : null;
}
