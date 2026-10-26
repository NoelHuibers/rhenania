import { describe, expect, test } from "vitest";

import { wallClockToUTC } from "~/lib/time";
import {
	createEvent,
	setSemesterConfig,
} from "../../../../../test/factories/events";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../../test/harness";
import { GET } from "./route";

setupTestDatabases();

const request = () =>
	new Request("https://corps-test.test.localhost/api/sempro/pdf");

describe("GET /api/sempro/pdf", () => {
	test("requires a signed-in member", async () => {
		await createTenant();

		const res = await GET(request());

		expect(res.status).toBe(401);
	});

	test("explains an incomplete semester config", async () => {
		await createTenant();
		signInAs(await createUser());

		const res = await GET(request());

		expect(res.status).toBe(400);
		expect(await res.text()).toContain("Semesterkonfiguration unvollständig");
	});

	test("renders the Semesterprogramm as a PDF download", async () => {
		await createTenant();
		signInAs(await createUser({ name: "Sepp", roles: ["Senior"] }));
		await setSemesterConfig({
			name: "Wintersemester 2026",
			startDate: wallClockToUTC("2026-10-12"),
			endDate: wallClockToUTC("2027-02-14"),
		});
		await createEvent({
			title: "AnCC",
			type: "oCC",
			date: wallClockToUTC("2026-10-18T18:00"),
		});
		await createEvent({
			title: "Stiftungsfest",
			type: "AHV",
			date: wallClockToUTC("2026-11-14T19:15"),
			endDate: wallClockToUTC("2026-11-15T12:00"),
		});

		const res = await GET(request());

		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/pdf");
		expect(res.headers.get("Content-Disposition")).toBe(
			'attachment; filename="Semesterprogramm_Wintersemester_2026.pdf"',
		);
		const bytes = Buffer.from(await res.arrayBuffer());
		expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
	}, 30_000);

	// The semester name goes verbatim into the Content-Disposition header;
	// characters above U+00FF (e.g. an en dash) make `new Response` throw.
	test.fails("handles typographic characters in the semester name (#145)", async () => {
		await createTenant();
		signInAs(await createUser());
		await setSemesterConfig({
			name: "SoSe 2027 – Jubiläum",
			startDate: wallClockToUTC("2027-04-12"),
			endDate: wallClockToUTC("2027-07-25"),
		});

		const res = await GET(request());

		expect(res.status).toBe(200);
	}, 30_000);
});
