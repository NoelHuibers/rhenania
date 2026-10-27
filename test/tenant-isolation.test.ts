// Two-tenant isolation: an Admin of Corps A, on A's host, passes Corps B's
// ids (users, drinks, events, bills, …), B's tenant id and B's member's
// e-mail address to every server action. Nothing of B may change and nothing
// of B may come back, except where a cross-Corps feature shows it on purpose.
//
// The other direction (a session of one Corps on another Corps' host) is the
// "Admin of another Corps" persona in authz-matrix.test.ts. Each tenant has
// its own DB file; the control DB is shared, which is where leaks would be.

import { beforeAll, describe, expect, test, vi } from "vitest";
import {
	createBillPeriodRow,
	createBillRow,
	createOrderRow,
} from "./factories/billing";
import {
	createEinnahme,
	createEtaplan,
	createKonto,
	createKostenpunkt,
	createReimbursement,
} from "./factories/cc-kasse";
import { createEvent, createVenue } from "./factories/events";
import {
	createFuchsenItem,
	createFuchsenOrder,
} from "./factories/fuchsenladen";
import { createMember } from "./factories/members";
import {
	createDrink,
	createTenant,
	createUser,
	ensureRole,
	flushAfter,
	setupTestDatabases,
	signInAs,
	switchTenant,
	type TestTenant,
} from "./harness";
import { type ServerAction, scanServerActions } from "./server-actions";
import { requireControl, requireTenant } from "./state";

vi.mock("@vercel/blob", () => ({
	put: vi.fn(async (pathname: string, body: unknown) => {
		if (body instanceof ReadableStream) {
			await new Response(body).arrayBuffer();
		}
		const url = `https://blob.test/${pathname}`;
		return { url, downloadUrl: url, pathname };
	}),
	del: vi.fn(async () => undefined),
	head: vi.fn(async () => ({})),
	list: vi.fn(async () => ({ blobs: [], hasMore: false })),
}));
vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));
vi.mock("~/server/lib/turso-platform");
vi.mock("~/server/lib/tenant-provisioning");
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
	recalculateAllAchievements: vi.fn(),
}));

beforeAll(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.stubGlobal("fetch", async () => {
		throw new Error("network disabled in the isolation test");
	});
});

/** Every string that only Corps B's data contains. */
const FOREIGN = "Fremdcorps";

/**
 * Actions that show another Corps' data on purpose (cross-Corps challenges
 * and rankings). They may return B's names; they still must not change B.
 */
const CROSS_CORPS_READS: Record<string, string> = {
	"src/server/actions/game/cross-tenant-discovery.ts#listChallengeableTenants":
		"lists the other Corps to challenge",
	"src/server/actions/game/cross-tenant-discovery.ts#listChallengeableUsers":
		"lists the members of the chosen Corps to challenge",
	"src/server/actions/newuser/users.ts#createUser":
		"inviting a person who already has an account adds that account to this Corps",
};

/**
 * Control tables an action of Corps A may legitimately write rows about B's
 * member into.
 */
const CROSS_CORPS_WRITES: Record<string, string> = {
	control_cross_tenant_challenge:
		"challenging a member of another Corps is a feature",
	control_user_stat:
		"the ELO is shared by all Corps; reading it creates the default row",
};

const ALL_ROLES = [
	"Admin",
	"Getränkewart",
	"CC-Kasse",
	"Fuchs",
	"Fotowart",
	"Senior",
	"Aktivenkasse",
	"AHV 1. Vorstand",
];

setupTestDatabases();

/** Corps B with one row in most tables, every name containing FOREIGN. */
async function seedForeignCorps(other: TestTenant) {
	switchTenant(other);
	const user = await createUser({
		name: `Berta ${FOREIGN}`,
		email: "berta@fremdcorps.test",
		roles: ["Admin"],
	});
	const roleId = await ensureRole("Admin");
	const drink = await createDrink({ name: `${FOREIGN}bräu` });
	const order = await createOrderRow({ user, drink });
	const period = await createBillPeriodRow();
	const bill = await createBillRow({ periodId: period.id, user });
	const event = await createEvent({ title: `${FOREIGN}kneipe` });
	const venue = await createVenue(`${FOREIGN}haus`, `${FOREIGN}straße 1`);
	const member = await createMember({ lastName: FOREIGN, userId: user.id });
	const etaplan = await createEtaplan({ name: `${FOREIGN} WS` });
	const kp = await createKostenpunkt(etaplan.id, { name: `${FOREIGN} Kneipe` });
	const reimbursement = await createReimbursement(kp, {
		description: `${FOREIGN} Auslage`,
	});
	const einnahme = await createEinnahme(kp, {
		description: `${FOREIGN} Eintritt`,
	});
	const konto = await createKonto({ description: `${FOREIGN} Konto` });
	const item = await createFuchsenItem({ name: `${FOREIGN}artikel` });
	const fuchsenOrder = await createFuchsenOrder({ user, item });

	// Arguments by parameter name; `id` depends on the module.
	const byName: Record<string, string> = {
		userId: user.id,
		winnerId: user.id,
		opponentId: user.id,
		tenantId: other.id,
		opponentTenantId: other.id,
		roleId,
		drinkId: drink.id,
		orderId: order.id,
		billId: bill.id,
		billPeriodId: period.id,
		eventId: event.id,
		recurringEventId: event.id,
		etaplanId: etaplan.id,
		kostenpunktId: kp.id,
		memberId: member.id,
		imageId: drink.id,
		chargeId: member.id,
		runId: etaplan.id,
		challengeId: order.id,
		email: user.email,
		treasurerEmail: user.email,
	};
	const idByModule: Record<string, string> = {
		"drinks.ts": drink.id,
		"events/events.ts": event.id,
		"events/recurring.ts": event.id,
		"venues.ts": venue.id,
		"kontos/kontos.ts": konto.id,
		"members/members.ts": member.id,
		"cc-kasse/etaplans.ts": etaplan.id,
		"cc-kasse/kostenpunkte.ts": kp.id,
		"cc-kasse/einnahmen.ts": einnahme.id,
		"cc-kasse/kostenerstattungen.ts": reimbursement.id,
		"fuchsenladen/items.ts": item.id,
		"fuchsenladen/orders.ts": fuchsenOrder.id,
	};
	return { user, byName, idByModule };
}

type Foreign = Awaited<ReturnType<typeof seedForeignCorps>>;

function argsFor(action: ServerAction, foreign: Foreign): unknown[] {
	const module = action.file.replace("src/server/actions/", "");
	const id = (name: string) =>
		foreign.byName[name] ??
		(name === "id" ? foreign.idByModule[module] : undefined) ??
		foreign.byName.drinkId;
	// Object parameters get every id-like key at once.
	const bag = {
		...foreign.byName,
		id: id("id"),
		name: "Neu",
		description: "Neu",
		amount: 1,
		quantity: 1,
		enabled: true,
		status: "Bezahlt",
		response: "accept",
		payment: "challenger",
	};
	return action.params.map(({ name, type }) => {
		if (type.includes("FormData")) {
			const form = new FormData();
			for (const [k, v] of Object.entries(bag)) {
				form.set(k, String(v));
			}
			return form;
		}
		if (type.endsWith("[]") || type.startsWith("Array<")) {
			return /Ids$/.test(name) ? [id(name.replace(/Ids$/, "Id"))] : [bag];
		}
		if (type === "number") {
			return 1;
		}
		if (type === "boolean") {
			return true;
		}
		if (type === "string" || /(Id|^id|email|Email)$/.test(name)) {
			return id(name);
		}
		return bag;
	});
}

/** All rows of every table, keyed by table. */
async function dump(
	client: { execute: (sql: string) => Promise<{ rows: unknown[] }> },
	filter: (table: string, row: string) => boolean = () => true,
) {
	const out: Record<string, string[]> = {};
	const tables = await client.execute(
		"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%' order by name",
	);
	for (const t of tables.rows as { name: string }[]) {
		const rows = await client.execute(
			`select * from "${t.name}" order by rowid`,
		);
		const kept = rows.rows
			.map((r) => JSON.stringify(r))
			.filter((r) => filter(t.name, r));
		if (kept.length > 0) {
			out[t.name] = kept;
		}
	}
	return out;
}

const actions = scanServerActions().actions.filter(
	// Superadmin actions are platform-wide and take tenant ids by design.
	(a) => !a.file.endsWith("superadmin/tenants.ts"),
);

describe("an Admin of one Corps cannot reach another Corps' data", () => {
	test.each(actions.map((a) => [a.key, a] as const))(
		"%s",
		async (_key, action) => {
			const home = await createTenant();
			const other = await createTenant({ displayName: FOREIGN });
			const admin = await createUser({ roles: ALL_ROLES, tenantId: home.id });
			const foreign = await seedForeignCorps(other);
			// B's own rows, and its member's identity. (Corps A inviting that
			// person by e-mail adds a membership in A, which is A's business.)
			const aboutB = (table: string, row: string) =>
				!(table in CROSS_CORPS_WRITES) &&
				(row.includes(other.id) ||
					(table !== "control_tenant_membership" &&
						row.includes(foreign.user.id)));

			const tenantB = requireTenant(other.id).client;
			const control = requireControl().client;
			const beforeB = await dump(tenantB);
			const beforeControl = await dump(control, aboutB);

			switchTenant(home);
			signInAs(admin);
			const mod = (await import(`../${action.file}`)) as Record<
				string,
				(...a: unknown[]) => Promise<unknown>
			>;
			let result: unknown;
			try {
				result = await mod[action.name]?.(...argsFor(action, foreign));
			} catch (error) {
				result = String(error);
			}
			await flushAfter().catch(() => {});

			expect(await dump(tenantB), "Corps B's database").toEqual(beforeB);
			expect(
				await dump(control, aboutB),
				"control rows about Corps B or its member",
			).toEqual(beforeControl);
			if (!(action.key in CROSS_CORPS_READS)) {
				expect(
					JSON.stringify(result ?? null),
					"the answer contains Corps B's data",
				).not.toContain(FOREIGN);
			}
		},
		30_000,
	);
});
