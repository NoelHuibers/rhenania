import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users } from "~/server/db/schema";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { tenantsHealth } from "./health";
import type { MirroredUser } from "./user-mirror";
import {
	inSync,
	planUserMirror,
	reconcileUserMirror,
} from "./user-mirror-reconcile";

setupTestDatabases();

const reconcile = (tenantId: string, dryRun = false) =>
	reconcileUserMirror(tenantDb(tenantId), controlDb(), tenantId, { dryRun });

const mirrorOf = async (userId: string, tenantId?: string) =>
	(
		await tenantDb(tenantId).select().from(users).where(eq(users.id, userId))
	)[0];

const setIdentity = (
	userId: string,
	patch: Partial<Pick<MirroredUser, "name" | "email" | "image">>,
) =>
	controlDb()
		.update(controlUsers)
		.set({ ...patch, updatedAt: new Date("2026-10-01T00:00:00Z") })
		.where(eq(controlUsers.id, userId));

const deleteMirror = (userId: string, tenantId?: string) =>
	tenantDb(tenantId).delete(users).where(eq(users.id, userId));

const mirrorDriftOf = async (slug: string) =>
	(await tenantsHealth()).find((h) => h.slug === slug)?.mirrorDrift;

describe("planUserMirror", () => {
	const member = (overrides: Partial<MirroredUser> = {}): MirroredUser => ({
		id: randomUUID(),
		name: "Max",
		email: "max@example.test",
		emailVerified: true,
		image: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		...overrides,
	});

	test("an identical mirror needs nothing", () => {
		const m = member();
		expect(planUserMirror([m], [m])).toEqual({
			insert: [],
			update: [],
			release: [],
		});
	});

	test("lists missing rows, changed fields and conflicting former members", () => {
		const missing = member({ email: "neu@example.test" });
		const changed = member({ email: "changed@example.test" });
		const former = { ...member(), email: "neu@example.test" };

		const plan = planUserMirror(
			[missing, changed],
			[{ ...changed, name: "Alt", emailVerified: false, image: "x" }, former],
		);

		expect(plan.insert).toEqual([missing]);
		expect(plan.update).toEqual([
			{ user: changed, fields: ["name", "emailVerified", "image"] },
		]);
		expect(plan.release).toEqual([
			{ userId: former.id, email: "neu@example.test" },
		]);
	});
});

describe("reconcileUserMirror", () => {
	test("inserts the mirror row of a member who has none", async () => {
		const tenant = await createTenant();
		const user = await createUser({ name: "Fehlt" });
		await deleteMirror(user.id);

		const report = await reconcile(tenant.id);

		expect(report).toMatchObject({
			members: 1,
			inserted: [user.id],
			updated: [],
			applied: true,
		});
		expect(await mirrorOf(user.id)).toMatchObject({
			name: "Fehlt",
			email: user.email,
		});
	});

	test("updates a changed name, e-mail and image", async () => {
		const tenant = await createTenant();
		const user = await createUser({ name: "Alt" });
		const untouched = await createUser();
		await setIdentity(user.id, {
			name: "Neu",
			email: "neu@example.test",
			image: "https://img.example/neu.png",
		});

		const report = await reconcile(tenant.id);

		expect(report.inserted).toEqual([]);
		expect(report.updated).toEqual([
			{ userId: user.id, fields: ["name", "email", "image"] },
		]);
		expect(await mirrorOf(user.id)).toMatchObject({
			name: "Neu",
			email: "neu@example.test",
			image: "https://img.example/neu.png",
			updatedAt: new Date("2026-10-01T00:00:00Z"),
		});
		expect((await mirrorOf(untouched.id))?.name).toBe(untouched.name);
	});

	test("resolves an e-mail swap between two members", async () => {
		const tenant = await createTenant();
		const a = await createUser({ email: "a@example.test" });
		const b = await createUser({ email: "b@example.test" });
		await setIdentity(a.id, { email: "tmp@example.test" });
		await setIdentity(b.id, { email: "a@example.test" });
		await setIdentity(a.id, { email: "b@example.test" });

		await reconcile(tenant.id);

		expect((await mirrorOf(a.id))?.email).toBe("b@example.test");
		expect((await mirrorOf(b.id))?.email).toBe("a@example.test");
		expect(inSync(await reconcile(tenant.id))).toBe(true);
	});

	test("keeps suspended members' rows and keeps them current", async () => {
		const tenant = await createTenant();
		const suspended = await createUser({ membership: "suspended" });
		const missing = await createUser({ membership: "suspended" });
		await deleteMirror(missing.id);
		await setIdentity(suspended.id, { name: "Gesperrt" });

		const report = await reconcile(tenant.id);

		expect(report.inserted).toEqual([missing.id]);
		expect(report.updated).toEqual([
			{ userId: suspended.id, fields: ["name"] },
		]);
		expect((await mirrorOf(suspended.id))?.name).toBe("Gesperrt");
		expect(await mirrorOf(missing.id)).toBeDefined();
	});

	test("leaves former members' rows alone, releasing only a needed e-mail", async () => {
		const tenant = await createTenant();
		const former = await createUser({
			name: "Ehemalig",
			email: "alt@example.test",
			membership: null,
		});
		const renamed = await createUser({ name: "Weg", membership: null });
		await setIdentity(renamed.id, { name: "Neuer Name" });
		// The control DB gave the former member's address to a new member.
		await setIdentity(former.id, { email: "anders@example.test" });
		const member = await createUser({ email: "neu@example.test" });
		await setIdentity(member.id, { email: "alt@example.test" });

		const report = await reconcile(tenant.id);

		expect(report.updated).toEqual([{ userId: member.id, fields: ["email"] }]);
		expect(report.released).toEqual([
			{ userId: former.id, email: "alt@example.test" },
		]);
		expect(await mirrorOf(former.id)).toMatchObject({
			name: "Ehemalig",
			email: `released+${former.id}@user-mirror.invalid`,
		});
		expect((await mirrorOf(renamed.id))?.name).toBe("Weg");
		expect((await mirrorOf(member.id))?.email).toBe("alt@example.test");
	});

	test("reports memberships whose identity is gone", async () => {
		const tenant = await createTenant();
		const ghost = randomUUID();
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: ghost, tenantId: tenant.id });

		const report = await reconcile(tenant.id);

		expect(report).toMatchObject({ members: 0, missingIdentity: [ghost] });
		expect(inSync(report)).toBe(true);
	});

	test("only touches the given tenant", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const user = await createUser({ tenantId: a.id });
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: user.id, tenantId: b.id });

		const report = await reconcile(a.id);

		expect(inSync(report)).toBe(true);
		expect(await mirrorOf(user.id, b.id)).toBeUndefined();
		expect((await reconcile(b.id)).inserted).toEqual([user.id]);
	});

	test("is idempotent", async () => {
		const tenant = await createTenant();
		const user = await createUser();
		await deleteMirror(user.id);
		const other = await createUser();
		await setIdentity(other.id, { name: "Neu" });

		expect(inSync(await reconcile(tenant.id))).toBe(false);
		const second = await reconcile(tenant.id);

		expect(second).toMatchObject({
			members: 2,
			inserted: [],
			updated: [],
			released: [],
		});
		expect(inSync(second)).toBe(true);
	});

	test("a dry run reports the same changes without writing", async () => {
		const tenant = await createTenant();
		const missing = await createUser();
		await deleteMirror(missing.id);
		const changed = await createUser({ name: "Alt" });
		await setIdentity(changed.id, { name: "Neu" });

		const dry = await reconcile(tenant.id, true);

		expect(dry).toMatchObject({
			applied: false,
			inserted: [missing.id],
			updated: [{ userId: changed.id, fields: ["name"] }],
		});
		expect(await mirrorOf(missing.id)).toBeUndefined();
		expect((await mirrorOf(changed.id))?.name).toBe("Alt");

		const applied = await reconcile(tenant.id);
		expect({ ...applied, applied: false }).toEqual(dry);
		expect((await mirrorOf(changed.id))?.name).toBe("Neu");
	});
});

describe("mirror drift in the health check", () => {
	test("counts missing and stale member rows, zero after reconcile", async () => {
		const tenant = await createTenant({ slug: "drift" });
		const clean = await createTenant({ slug: "sauber" });
		const missing = await createUser({ tenantId: tenant.id });
		await deleteMirror(missing.id, tenant.id);
		const stale = await createUser({ tenantId: tenant.id });
		await setIdentity(stale.id, { image: "https://img.example/x.png" });
		await createUser({ tenantId: tenant.id, membership: null });
		await createUser({ tenantId: clean.id });

		expect(await mirrorDriftOf("drift")).toBe(2);
		expect(await mirrorDriftOf("sauber")).toBe(0);

		await reconcile(tenant.id);
		expect(await mirrorDriftOf("drift")).toBe(0);
	});

	test("agrees with reconcile on e-mail verification and null names", async () => {
		const tenant = await createTenant({ slug: "felder" });
		const user = await createUser();
		await controlDb()
			.update(controlUsers)
			.set({ emailVerified: false, name: null })
			.where(eq(controlUsers.id, user.id));

		const dry = await reconcile(tenant.id, true);
		expect(dry.updated).toEqual([
			{ userId: user.id, fields: ["name", "emailVerified"] },
		]);
		expect(await mirrorDriftOf("felder")).toBe(1);

		await reconcile(tenant.id);
		expect(await mirrorDriftOf("felder")).toBe(0);
	});
});
