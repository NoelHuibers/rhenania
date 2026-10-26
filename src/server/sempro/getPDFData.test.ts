import { describe, expect, test } from "vitest";

import { wallClockToUTC } from "~/lib/time";
import { kontos, recurringEvents } from "~/server/db/schema";
import { createEvent, setSemesterConfig } from "../../../test/factories/events";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { getPDFData } from "./getPDFData";

setupTestDatabases();

// The admin form stores the semester bounds as Berlin midnight of the picked days.
const SEMESTER = {
	name: "Wintersemester 2026/27",
	startDate: wallClockToUTC("2026-10-12"),
	endDate: wallClockToUTC("2027-02-14"),
};

describe("getPDFData", () => {
	test("returns null until the semester is configured", async () => {
		await createTenant();

		expect(await getPDFData()).toBeNull();

		await setSemesterConfig({ ...SEMESTER, name: "" });
		expect(await getPDFData()).toBeNull();
	});

	test("collects leaders by rank, the active CC-Kasse account and rule texts", async () => {
		await createTenant();
		await setSemesterConfig(SEMESTER);
		await createUser({ name: "Fritz FM", roles: ["Fuchsmajor"] });
		await createUser({ name: "Sepp Senior", roles: ["Senior", "Admin"] });
		await createUser({ name: "Carl Consenior", roles: ["Consenior"] });
		await createUser({ name: "Nur Mitglied", roles: ["Admin"] });
		await tenantDb()
			.insert(kontos)
			.values([
				{
					kasseType: "CC-Kasse",
					iban: "DE00OLD",
					bic: "OLD",
					bankName: "Alt",
					isActive: false,
				},
				{
					kasseType: "Getränkekasse",
					iban: "DE00DRINKS",
					bic: "DRK",
					bankName: "Bier",
				},
				{
					kasseType: "CC-Kasse",
					iban: "DE89370400440532013000",
					bic: "COBADEFFXXX",
					bankName: "Commerzbank",
				},
			]);
		await tenantDb()
			.insert(recurringEvents)
			.values([
				{
					title: "Jour Fix",
					type: "Jour Fix",
					recurrenceType: "monthly_1st_3rd_wednesday",
				},
				{ title: "Stammtisch", type: "Stammtisch", recurrenceType: "biweekly" },
			]);

		const data = await getPDFData();

		expect(data).toMatchObject({
			semesterName: "Wintersemester 2026/27",
			startDate: SEMESTER.startDate,
			endDate: SEMESTER.endDate,
			leaders: [
				{ name: "Sepp Senior", role: "Senior" },
				{ name: "Carl Consenior", role: "Consenior" },
				{ name: "Fritz FM", role: "Fuchsmajor" },
			],
			ccKonto: {
				iban: "DE89370400440532013000",
				bic: "COBADEFFXXX",
				bankName: "Commerzbank",
			},
			jourFixeRule: "jeden 1. und 3. Mittwoch im Monat",
			stammtischRule: "alle zwei Wochen",
		});
	});

	test("lists the semester's events in order, cancelled ones flagged", async () => {
		await createTenant();
		await setSemesterConfig(SEMESTER);
		await createEvent({
			title: "vorher",
			date: wallClockToUTC("2026-10-05T20:00"),
		});
		await createEvent({
			title: "AnCC",
			date: wallClockToUTC("2026-10-18T18:00"),
		});
		await createEvent({
			title: "Kneipe",
			date: wallClockToUTC("2026-10-13T20:00"),
			isCancelled: true,
			isPublic: false,
		});
		await createEvent({
			title: "danach",
			date: wallClockToUTC("2027-02-20T20:00"),
		});

		const data = await getPDFData();

		expect(data?.events).toEqual([
			expect.objectContaining({
				title: "Kneipe",
				isCancelled: true,
				isPublic: false,
			}),
			expect.objectContaining({ title: "AnCC", isCancelled: false }),
		]);
		expect(data?.ccKonto).toBeNull();
		expect(data?.leaders).toEqual([]);
		expect(data?.jourFixeRule).toBeNull();
	});

	// endDate is the picked last day at 00:00, and the query uses
	// `date <= endDate`, so anything later on the last day is dropped.
	test.fails("includes events on the semester's last day (new)", async () => {
		await createTenant();
		await setSemesterConfig(SEMESTER);
		await createEvent({
			title: "AbCC",
			date: wallClockToUTC("2027-02-14T18:00"),
		});

		const data = await getPDFData();

		expect(data?.events.map((e) => e.title)).toEqual(["AbCC"]);
	});
});
