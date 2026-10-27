import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users, verificationTokens } from "~/server/db/schema";
import {
	controlDb,
	createTenant,
	createUser as createTestUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import { sendVerificationEmail } from "./email";
import { createUser } from "./users";

vi.mock("./email", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
});

async function signInAsAdmin() {
	const admin = await createTestUser({ roles: ["Admin"] });
	signInAs(admin);
	return admin;
}

const tokensFor = (email: string, tenantId?: string) =>
	tenantDb(tenantId)
		.select()
		.from(verificationTokens)
		.where(eq(verificationTokens.identifier, email));

describe("admin gate", () => {
	test("members without the Admin role cannot invite", async () => {
		await createTenant();
		const member = await createTestUser({ roles: ["Getränkewart"] });

		await expect(createUser({ email: "neu@example.test" })).rejects.toThrow(
			"Nicht angemeldet",
		);
		signInAs(member);
		await expect(createUser({ email: "neu@example.test" })).rejects.toThrow(
			"Keine Berechtigung",
		);

		expect(await controlDb().select().from(controlUsers)).toHaveLength(1);
		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});
});

describe("createUser (invite)", () => {
	test("creates identity, membership, mirror and a 24h token, then mails it", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
		const tenant = await createTenant();
		await signInAsAdmin();

		const result = await createUser({
			email: "Neu.Mitglied@Example.TEST",
			name: "Neu Mitglied",
		});

		expect(result).toEqual({
			success: true,
			user: {
				id: expect.any(String),
				email: "neu.mitglied@example.test",
				name: "Neu Mitglied",
				image: null,
				emailVerified: false,
			},
		});
		const id = result.user?.id ?? "";
		const [identity] = await controlDb()
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.id, id));
		expect(identity).toMatchObject({
			email: "neu.mitglied@example.test",
			emailVerified: false,
		});
		expect(
			await controlDb()
				.select()
				.from(tenantMemberships)
				.where(eq(tenantMemberships.userId, id)),
		).toEqual([
			expect.objectContaining({ tenantId: tenant.id, status: "active" }),
		]);
		expect(
			(await tenantDb().select().from(users).where(eq(users.id, id)))[0],
		).toMatchObject({
			email: "neu.mitglied@example.test",
			name: "Neu Mitglied",
		});

		const [token] = await tokensFor("neu.mitglied@example.test");
		expect(token?.token).toMatch(/^[0-9a-f]{64}$/);
		expect(token?.expires).toEqual(new Date("2026-10-27T12:00:00Z"));
		expect(sendVerificationEmail).toHaveBeenCalledWith(
			"Neu.Mitglied@Example.TEST",
			token?.token,
		);
		expect(checkAndUnlockAchievements).toHaveBeenCalledWith(
			id,
			"account_created",
			undefined,
			{ tenantId: tenant.id },
		);
	});

	test("adds an existing identity from another Corps without duplicating it", async () => {
		const home = await createTenant();
		const known = await createTestUser({
			name: "Bekannt",
			email: "bekannt@example.test",
			tenantId: home.id,
		});
		const tenant = await createTenant();
		switchTenant(tenant);
		await signInAsAdmin();

		const result = await createUser({ email: "BEKANNT@example.test" });

		expect(result).toMatchObject({
			success: true,
			user: { id: known.id, name: "Bekannt", emailVerified: true },
		});
		expect(
			await controlDb()
				.select()
				.from(controlUsers)
				.where(eq(controlUsers.email, "bekannt@example.test")),
		).toHaveLength(1);
		const memberships = await controlDb()
			.select({ tenantId: tenantMemberships.tenantId })
			.from(tenantMemberships)
			.where(eq(tenantMemberships.userId, known.id));
		expect(memberships.map((m) => m.tenantId).sort()).toEqual(
			[home.id, tenant.id].sort(),
		);
		expect(
			await tenantDb(tenant.id)
				.select()
				.from(users)
				.where(eq(users.id, known.id)),
		).toHaveLength(1);
		expect(checkAndUnlockAchievements).not.toHaveBeenCalled();
	});

	test("refuses to invite someone who is already a member", async () => {
		await createTenant();
		await signInAsAdmin();
		await createTestUser({ email: "dabei@example.test" });

		expect(await createUser({ email: "Dabei@example.test" })).toEqual({
			success: false,
			error: "Ein Benutzer mit dieser E-Mail-Adresse ist bereits Mitglied.",
		});
		expect(await tokensFor("dabei@example.test")).toHaveLength(0);
		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});

	test("keeps the invitation when the mail cannot be sent", async () => {
		await createTenant();
		await signInAsAdmin();
		vi.mocked(sendVerificationEmail).mockRejectedValueOnce(
			new Error("Failed to send verification email"),
		);

		const result = await createUser({ email: "neu@example.test" });

		expect(result.success).toBe(true);
		expect(await tokensFor("neu@example.test")).toHaveLength(1);
	});
});
