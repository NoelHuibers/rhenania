import { describe, expect, test } from "vitest";

import { calendarTokens } from "~/server/db/schema";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { getOrCreateCalendarToken, rotateCalendarToken } from "./calendarToken";

setupTestDatabases();

describe("calendar tokens", () => {
	test("a member gets one stable, URL-safe token", async () => {
		await createTenant();
		signInAs(await createUser());

		const first = await getOrCreateCalendarToken();
		const second = await getOrCreateCalendarToken();

		expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
		expect(second).toBe(first);
		expect(await tenantDb().select().from(calendarTokens)).toHaveLength(1);
	});

	test("rotating replaces the old token", async () => {
		await createTenant();
		signInAs(await createUser());
		const old = await getOrCreateCalendarToken();

		const rotated = await rotateCalendarToken();

		expect(rotated).not.toBe(old);
		expect(
			(await tenantDb().select().from(calendarTokens)).map((t) => t.token),
		).toEqual([rotated]);
	});

	test("signed-out visitors get no token", async () => {
		await createTenant();

		expect(await getOrCreateCalendarToken()).toBeNull();
		expect(await rotateCalendarToken()).toBeNull();
		expect(await tenantDb().select().from(calendarTokens)).toHaveLength(0);
	});
});
