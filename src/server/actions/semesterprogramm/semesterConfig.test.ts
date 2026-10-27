import { sql } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { semesterConfig } from "~/server/db/schema";
import { log } from "~/server/lib/log";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { createVenue, deleteVenue, getVenues, updateVenue } from "../venues";
import { getSemesterConfig, upsertSemesterConfig } from "./semesterConfig";

setupTestDatabases();

async function asAdmin() {
	await createTenant();
	signInAs(await createUser({ roles: ["Admin"] }));
}

describe("semester config", () => {
	test("is empty until saved, then a single overwritable row", async () => {
		await asAdmin();
		expect(await getSemesterConfig()).toBeNull();

		await upsertSemesterConfig({
			name: "WS 26/27",
			startDate: new Date("2026-10-01T00:00:00Z"),
			endDate: new Date("2027-03-31T00:00:00Z"),
		});
		const result = await upsertSemesterConfig({
			name: "Wintersemester 2026/27",
			startDate: new Date("2026-10-12T00:00:00Z"),
			endDate: new Date("2027-02-14T00:00:00Z"),
		});

		expect(result).toEqual({ success: true });
		expect(await tenantDb().select().from(semesterConfig)).toHaveLength(1);
		expect(await getSemesterConfig()).toMatchObject({
			name: "Wintersemester 2026/27",
			startDate: new Date("2026-10-12T00:00:00Z"),
			endDate: new Date("2027-02-14T00:00:00Z"),
		});
	});
});

describe("venues", () => {
	test("CRUD, sorted by short name", async () => {
		await asAdmin();
		await createVenue("Ratskeller", "Marktplatz 1, 70173 Stuttgart");
		await createVenue("Corpshaus", "Hauptstr. 1, 70174 Stuttgart");

		expect((await getVenues()).map((v) => v.shortName)).toEqual([
			"Corpshaus",
			"Ratskeller",
		]);

		const haus = (await getVenues()).find((v) => v.shortName === "Corpshaus");
		await updateVenue(haus?.id ?? "", "Haus", "Hauptstr. 2, 70174 Stuttgart");
		expect(await getVenues()).toContainEqual(
			expect.objectContaining({
				shortName: "Haus",
				fullAddress: "Hauptstr. 2, 70174 Stuttgart",
			}),
		);

		expect(await deleteVenue(haus?.id ?? "")).toEqual({ ok: true });
		expect((await getVenues()).map((v) => v.shortName)).toEqual(["Ratskeller"]);
	});

	test("short names are unique", async () => {
		await asAdmin();
		await createVenue("adH", "Hauptstr. 1");
		await createVenue("Ratskeller", "Marktplatz 1");
		const ratskeller = (await getVenues()).find(
			(v) => v.shortName === "Ratskeller",
		);

		const taken = {
			ok: false,
			error: "Kurzname bereits vergeben",
			code: "SHORT_NAME_TAKEN",
		};
		expect(await createVenue("adH", "Woanders 2")).toEqual(taken);
		expect(
			await updateVenue(ratskeller?.id ?? "", "adH", "Marktplatz 1"),
		).toEqual(taken);
		expect(await getVenues()).toHaveLength(2);
	});

	test("other database errors are logged, not blamed on the short name", async () => {
		await asAdmin();
		const logError = vi.spyOn(log, "error").mockResolvedValue(undefined);
		await createVenue("adH", "Hauptstr. 1");
		const [venue] = await getVenues();
		for (const event of ["INSERT", "UPDATE"]) {
			await tenantDb().run(
				sql.raw(
					`CREATE TRIGGER fail_${event} BEFORE ${event} ON venue BEGIN SELECT RAISE(ABORT, 'disk I/O error'); END`,
				),
			);
		}
		const failed = {
			ok: false,
			error: "Fehler beim Speichern",
			code: "INTERNAL",
		};

		expect(await createVenue("Ratskeller", "Marktplatz 1")).toEqual(failed);
		expect(await updateVenue(venue?.id ?? "", "Haus", "Hauptstr. 1")).toEqual(
			failed,
		);
		expect(logError).toHaveBeenCalledTimes(2);
		expect((await getVenues()).map((v) => v.shortName)).toEqual(["adH"]);
		logError.mockRestore();
	});

	test("only Admins change venues", async () => {
		await asAdmin();
		signInAs(await createUser());

		expect(await createVenue("adH", "Hauptstr. 1")).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
		expect(await getVenues()).toEqual([]);
	});
});
