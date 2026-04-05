import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "~/server/db";
import {
	events,
	kontos,
	recurringEvents,
	roles,
	semesterConfig,
	userRoles,
	users,
} from "~/server/db/schema";

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

const RANK_MAP: Record<string, string> = {
	Senior: "x",
	Consenior: "xx",
	Subsenior: "xxx",
	Fuchsmajor: "FM",
};

const LEADERSHIP_ROLES = ["Senior", "Consenior", "Subsenior", "Fuchsmajor"];

const RECURRENCE_LABELS: Record<string, string> = {
	monthly_1st_3rd_wednesday: "jeden 1. und 3. Mittwoch im Monat",
	monthly_1st_wednesday: "jeden 1. Mittwoch im Monat",
	biweekly: "alle zwei Wochen",
	occ_semester: "nach Semesterplan",
};

export async function getPDFData(): Promise<PDFData | null> {
	// Semester config
	const [config] = await db
		.select()
		.from(semesterConfig)
		.where(eq(semesterConfig.id, "singleton"))
		.limit(1);

	if (!config?.startDate || !config?.endDate || !config.name) return null;

	// Leadership: users with Senior/Consenior/Subsenior/Fuchsmajor
	const leaderRows = await db
		.select({ name: users.name, roleName: roles.name })
		.from(users)
		.innerJoin(userRoles, eq(users.id, userRoles.userId))
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(inArray(roles.name, LEADERSHIP_ROLES));

	const leaders: PDFLeader[] = leaderRows
		.filter((r) => r.name)
		.map((r) => ({ name: r.name!, role: r.roleName }))
		.sort(
			(a, b) =>
				LEADERSHIP_ROLES.indexOf(a.role) - LEADERSHIP_ROLES.indexOf(b.role),
		);

	// CC-Kasse konto
	const [ccKonto] = await db
		.select({ iban: kontos.iban, bic: kontos.bic, bankName: kontos.bankName })
		.from(kontos)
		.where(and(eq(kontos.kasseType, "CC-Kasse"), eq(kontos.isActive, true)))
		.limit(1);

	// Recurring events for rule text
	const recurring = await db.select().from(recurringEvents);
	const jourFixe = recurring.find((r) => r.type === "Jour Fix");
	const stammtisch = recurring.find((r) => r.type === "Stammtisch");

	// Events within semester range, not cancelled
	const semEvents = await db
		.select()
		.from(events)
		.where(
			and(
				gte(events.date, config.startDate),
				lte(events.date, config.endDate),
			),
		)
		.orderBy(asc(events.date));

	return {
		semesterName: config.name,
		startDate: config.startDate,
		endDate: config.endDate,
		leaders,
		ccKonto: ccKonto ?? null,
		jourFixeRule: jourFixe
			? RECURRENCE_LABELS[jourFixe.recurrenceType] ?? null
			: null,
		stammtischRule: stammtisch
			? RECURRENCE_LABELS[stammtisch.recurrenceType] ?? null
			: null,
		events: semEvents.map((e) => ({
			date: e.date,
			endDate: e.endDate,
			title: e.title,
			location: e.location,
			type: e.type,
			isPublic: e.isPublic,
			isCancelled: e.isCancelled,
		})),
	};
}

export { RANK_MAP };
