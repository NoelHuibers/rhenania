import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { wallClockToUTC } from "~/lib/time";
import { events, recurringEvents } from "~/server/db/schema";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	createRecurringEvent,
	deleteRecurringEvent,
	generateInstances,
	getAllRecurringEvents,
	type RecurringEventInput,
	toggleEventCancelled,
	toggleRecurringEventActive,
	updateRecurringEvent,
} from "./recurring";

setupTestDatabases();

// Occurrences are computed with the server's local clock (setHours/getDay),
// so every test pins the process time zone explicitly. Production runs in
// UTC; the "happy path" tests use Europe/Berlin (what the admins mean) and
// summer-semester dates without a DST change.
const ORIGINAL_TZ = process.env.TZ;
function serverTimeZone(tz: "UTC" | "Europe/Berlin") {
	process.env.TZ = tz;
}

beforeEach(() => {
	serverTimeZone("Europe/Berlin");
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-04-01T10:00:00Z"));
});
afterEach(() => {
	vi.useRealTimers();
	process.env.TZ = ORIGINAL_TZ;
});

const berlin = new Intl.DateTimeFormat("de-DE", {
	timeZone: "Europe/Berlin",
	weekday: "short",
	day: "2-digit",
	month: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});
/** e.g. "Mo., 13.04., 20:00" — what members see in the Semesterprogramm. */
const shown = (d: Date) => berlin.format(d);

const base: RecurringEventInput = {
	title: "Stammtisch",
	type: "Stammtisch",
	recurrenceType: "biweekly",
	time: "20:00",
};

/** Creates a template the way the admin form does (dates as Berlin days). */
async function template(
	input: Partial<RecurringEventInput> & {
		start?: string;
		end?: string;
	} = {},
) {
	const { start, end, ...rest } = input;
	await createRecurringEvent({
		...base,
		...rest,
		startDate: start ? wallClockToUTC(start) : undefined,
		endDate: end ? wallClockToUTC(end) : undefined,
	});
	const all = await getAllRecurringEvents();
	const created = all.at(-1);
	if (!created) throw new Error("template not created");
	return created;
}

async function instances(recurringEventId: string) {
	return tenantDb()
		.select()
		.from(events)
		.where(eq(events.recurringEventId, recurringEventId))
		.orderBy(asc(events.date));
}

async function setup() {
	await createTenant();
	const admin = await createUser({ roles: ["Admin"] });
	signInAs(admin);
	return admin;
}

describe("recurring event templates", () => {
	test("creates templates with defaults and updates single fields", async () => {
		const admin = await setup();
		const t = await template({ createdBy: admin.id, dayOfWeek: 3 });

		expect(t).toMatchObject({
			title: "Stammtisch",
			location: "adH Rhenania",
			isPublic: true,
			isActive: true,
			dayOfWeek: 3,
			createdBy: admin.id,
		});

		await updateRecurringEvent(t.id, { time: "19:30", isPublic: false });
		expect((await getAllRecurringEvents())[0]).toMatchObject({
			title: "Stammtisch",
			time: "19:30",
			isPublic: false,
			dayOfWeek: 3,
		});
	});

	test("toggles the active flag and reports unknown templates", async () => {
		await setup();
		const t = await template();

		await toggleRecurringEventActive(t.id);
		expect((await getAllRecurringEvents())[0]?.isActive).toBe(false);
		await toggleRecurringEventActive(t.id);
		expect((await getAllRecurringEvents())[0]?.isActive).toBe(true);

		expect(await toggleRecurringEventActive("missing")).toEqual({
			success: false,
			error: "Nicht gefunden",
		});
	});

	test("deleting a template keeps its generated events", async () => {
		await setup();
		const t = await template({
			dayOfWeek: 1,
			start: "2026-04-13",
			end: "2026-04-27",
		});
		await generateInstances(t.id);

		expect(await deleteRecurringEvent(t.id)).toEqual({ success: true });

		expect(await tenantDb().select().from(recurringEvents)).toHaveLength(0);
		const left = await tenantDb().select().from(events);
		expect(left).toHaveLength(2);
		expect(left.every((e) => e.recurringEventId === null)).toBe(true);
	});
});

describe("generateInstances", () => {
	test("biweekly: every other weekday from start to end date inclusive", async () => {
		const admin = await setup();
		const t = await template({
			dayOfWeek: 1,
			start: "2026-04-13",
			end: "2026-07-20",
			location: "Ratskeller",
			description: "Offen für alle",
			meetingUrl: "https://meet.example/st",
			createdBy: admin.id,
		});

		expect(await generateInstances(t.id)).toEqual({
			success: true,
			created: 8,
		});

		const rows = await instances(t.id);
		expect(rows.map((e) => shown(e.date))).toEqual([
			"Mo., 13.04., 20:00",
			"Mo., 27.04., 20:00",
			"Mo., 11.05., 20:00",
			"Mo., 25.05., 20:00",
			"Mo., 08.06., 20:00",
			"Mo., 22.06., 20:00",
			"Mo., 06.07., 20:00",
			"Mo., 20.07., 20:00",
		]);
		expect(rows[0]).toMatchObject({
			title: "Stammtisch",
			type: "Stammtisch",
			location: "Ratskeller",
			description: "Offen für alle",
			meetingUrl: "https://meet.example/st",
			isPublic: true,
			isCancelled: false,
			createdBy: admin.id,
		});
	});

	test("biweekly: a start date before the weekday snaps forward to it", async () => {
		await setup();
		// Thursday start, Monday cadence
		const t = await template({
			dayOfWeek: 1,
			start: "2026-04-09",
			end: "2026-05-01",
		});

		await generateInstances(t.id);

		expect((await instances(t.id)).map((e) => shown(e.date))).toEqual([
			"Mo., 13.04., 20:00",
			"Mo., 27.04., 20:00",
		]);
	});

	test("monthly: first and third Wednesday within the range", async () => {
		await setup();
		const t = await template({
			title: "Jour Fix",
			type: "Jour Fix",
			recurrenceType: "monthly_1st_3rd_wednesday",
			time: "19:30",
			start: "2026-04-13",
			end: "2026-07-20",
		});

		await generateInstances(t.id);

		expect((await instances(t.id)).map((e) => shown(e.date))).toEqual([
			"Mi., 15.04., 19:30",
			"Mi., 06.05., 19:30",
			"Mi., 20.05., 19:30",
			"Mi., 03.06., 19:30",
			"Mi., 17.06., 19:30",
			"Mi., 01.07., 19:30",
			"Mi., 15.07., 19:30",
		]);
	});

	test("monthly: without dates it covers today plus six months", async () => {
		await setup();
		vi.setSystemTime(new Date("2026-05-10T10:00:00Z"));
		const t = await template({ recurrenceType: "monthly_1st_wednesday" });

		await generateInstances(t.id);

		expect((await instances(t.id)).map((e) => shown(e.date))).toEqual([
			"Mi., 03.06., 20:00",
			"Mi., 01.07., 20:00",
			"Mi., 05.08., 20:00",
			"Mi., 02.09., 20:00",
			"Mi., 07.10., 20:00",
			"Mi., 04.11., 20:00",
		]);
	});

	test("oCC semester: AnCC, numbered Monday oCCs, AbCC", async () => {
		await setup();
		const t = await template({
			title: "oCC",
			type: "oCC",
			recurrenceType: "occ_semester",
			start: "2026-04-19",
			end: "2026-07-12",
		});

		await generateInstances(t.id);

		expect(
			(await instances(t.id)).map((e) => `${e.title} ${shown(e.date)}`),
		).toEqual([
			"AnCC So., 19.04., 18:00",
			"2. oCC Mo., 04.05., 20:00",
			"3. oCC Mo., 18.05., 20:00",
			"4. oCC Mo., 01.06., 20:00",
			"5. oCC Mo., 15.06., 20:00",
			"6. oCC Mo., 29.06., 20:00",
			"AbCC So., 12.07., 18:00",
		]);
	});

	test("oCC semester needs both dates", async () => {
		await setup();
		const t = await template({
			recurrenceType: "occ_semester",
			start: "2026-04-19",
		});

		expect(await generateInstances(t.id)).toEqual({
			success: true,
			created: 0,
		});
	});

	test("running again only fills in missing days", async () => {
		await setup();
		const t = await template({
			dayOfWeek: 1,
			start: "2026-04-13",
			end: "2026-05-25",
		});
		await generateInstances(t.id);
		const [first, second] = await instances(t.id);
		// The admin cancels one date, moves another by an hour and deletes a third.
		await toggleEventCancelled(first?.id ?? "");
		await tenantDb()
			.update(events)
			.set({ date: new Date((second?.date.getTime() ?? 0) + 3_600_000) })
			.where(eq(events.id, second?.id ?? ""));
		const third = (await instances(t.id))[2];
		await tenantDb()
			.delete(events)
			.where(eq(events.id, third?.id ?? ""));

		expect(await generateInstances(t.id)).toEqual({
			success: true,
			created: 1,
		});
		expect(await generateInstances(t.id)).toEqual({
			success: true,
			created: 0,
		});

		const rows = await instances(t.id);
		expect(rows.map((e) => shown(e.date))).toEqual([
			"Mo., 13.04., 20:00",
			"Mo., 27.04., 21:00",
			"Mo., 11.05., 20:00",
			"Mo., 25.05., 20:00",
		]);
		expect(rows[0]?.isCancelled).toBe(true);
	});

	test("reports unknown templates", async () => {
		await setup();

		expect(await generateInstances("missing")).toEqual({
			success: false,
			error: "Vorlage nicht gefunden",
		});
	});

	// Production runs with TZ=UTC: setHours("20:00") is UTC wall-clock time
	// (22:00 in Berlin) and an end-day occurrence falls outside the range.
	test.fails("biweekly times are Berlin wall-clock on a UTC server (#15)", async () => {
		await setup();
		serverTimeZone("UTC");
		const t = await template({
			dayOfWeek: 1,
			start: "2026-06-22",
			end: "2026-07-20",
		});

		await generateInstances(t.id);

		expect((await instances(t.id)).map((e) => shown(e.date))).toEqual([
			"Mo., 22.06., 20:00",
			"Mo., 06.07., 20:00",
			"Mo., 20.07., 20:00",
		]);
	});

	// On a UTC server the AnCC day (Berlin midnight = 22:00 UTC the day
	// before) is truncated to the previous day, shifting every oCC by a day.
	test.fails("oCC dates keep their weekdays on a UTC server (#15)", async () => {
		await setup();
		serverTimeZone("UTC");
		const t = await template({
			recurrenceType: "occ_semester",
			start: "2026-06-14",
			end: "2026-07-12",
		});

		await generateInstances(t.id);

		expect(
			(await instances(t.id)).map((e) => `${e.title} ${shown(e.date)}`),
		).toEqual([
			"AnCC So., 14.06., 18:00",
			"2. oCC Mo., 29.06., 20:00",
			"AbCC So., 12.07., 18:00",
		]);
	});

	// Steps of 14 × 24h from local midnight land on 23:00 the previous day
	// once DST ends (last Sunday in October), so later dates move a day early.
	test.fails("biweekly dates keep their weekday across the end of DST (new)", async () => {
		await setup();
		const t = await template({
			dayOfWeek: 1,
			start: "2026-10-12",
			end: "2026-11-23",
		});

		await generateInstances(t.id);

		expect((await instances(t.id)).map((e) => shown(e.date))).toEqual([
			"Mo., 12.10., 20:00",
			"Mo., 26.10., 20:00",
			"Mo., 09.11., 20:00",
			"Mo., 23.11., 20:00",
		]);
	});

	test.fails("winter oCC dates keep their weekdays across the end of DST (new)", async () => {
		await setup();
		const t = await template({
			recurrenceType: "occ_semester",
			start: "2026-10-18",
			end: "2026-11-29",
		});

		await generateInstances(t.id);

		expect(
			(await instances(t.id)).map((e) => `${e.title} ${shown(e.date)}`),
		).toEqual([
			"AnCC So., 18.10., 18:00",
			"2. oCC Mo., 02.11., 20:00",
			"3. oCC Mo., 16.11., 20:00",
			"AbCC So., 29.11., 18:00",
		]);
	});
});

describe("toggleEventCancelled", () => {
	test("flips the cancelled flag and reports unknown events", async () => {
		await setup();
		const t = await template({
			dayOfWeek: 1,
			start: "2026-04-13",
			end: "2026-04-13",
		});
		await generateInstances(t.id);
		const [event] = await instances(t.id);

		await toggleEventCancelled(event?.id ?? "");
		expect((await instances(t.id))[0]?.isCancelled).toBe(true);
		await toggleEventCancelled(event?.id ?? "");
		expect((await instances(t.id))[0]?.isCancelled).toBe(false);

		expect(await toggleEventCancelled("missing")).toEqual({
			success: false,
			error: "Nicht gefunden",
		});
	});
});
