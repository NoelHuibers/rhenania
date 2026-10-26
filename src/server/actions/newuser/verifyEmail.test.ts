import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
	accounts,
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { users, verificationTokens } from "~/server/db/schema";
import { createAccount } from "../../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import { verifyEmailAndSetPassword } from "./verifyEmail";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

const PASSWORD = "Sicher123";

/** An invited, not yet verified member with an open invitation token. */
async function invited(
	opts: { expires?: Date; email?: string } = {},
	tenantId?: string,
) {
	const user = await createUser({ email: opts.email, tenantId });
	await controlDb()
		.update(controlUsers)
		.set({ emailVerified: false })
		.where(eq(controlUsers.id, user.id));
	await tenantDb(tenantId)
		.update(users)
		.set({ emailVerified: false })
		.where(eq(users.id, user.id));
	const token = `token-${user.id}`;
	await tenantDb(tenantId)
		.insert(verificationTokens)
		.values({
			identifier: user.email,
			token,
			expires: opts.expires ?? new Date(Date.now() + 60 * 60 * 1000),
		});
	return { user, token };
}

const tokenRows = () => tenantDb().select().from(verificationTokens);
const identityOf = async (id: string) =>
	(
		await controlDb().select().from(controlUsers).where(eq(controlUsers.id, id))
	)[0];

describe("verifyEmailAndSetPassword", () => {
	test("verifies the identity, stores a bcrypt password and consumes the token", async () => {
		const tenant = await createTenant();
		const other = await createTenant();
		const { user, token } = await invited({}, tenant.id);
		await controlDb()
			.insert(tenantMemberships)
			.values({ userId: user.id, tenantId: other.id });
		await tenantDb(other.id)
			.insert(users)
			.values({ ...user, emailVerified: false });

		const result = await verifyEmailAndSetPassword(
			token,
			user.email.toUpperCase(),
			PASSWORD,
		);

		expect(result).toEqual({ success: true });
		expect((await identityOf(user.id))?.emailVerified).toBe(true);
		for (const id of [tenant.id, other.id]) {
			const [mirror] = await tenantDb(id)
				.select()
				.from(users)
				.where(eq(users.id, user.id));
			expect(mirror?.emailVerified).toBe(true);
		}
		const [account] = await controlDb()
			.select()
			.from(accounts)
			.where(eq(accounts.userId, user.id));
		expect(account).toMatchObject({
			providerId: "credential",
			accountId: user.email,
		});
		expect(await bcrypt.compare(PASSWORD, account?.password ?? "")).toBe(true);
		expect(await tokenRows()).toHaveLength(0);
	});

	test("overwrites the password of an existing credential account", async () => {
		await createTenant();
		const { user, token } = await invited();
		await createAccount(user.id, "credential", { password: "old-hash" });

		await verifyEmailAndSetPassword(token, user.email, PASSWORD);

		const rows = await controlDb()
			.select()
			.from(accounts)
			.where(eq(accounts.userId, user.id));
		expect(rows).toHaveLength(1);
		expect(await bcrypt.compare(PASSWORD, rows[0]?.password ?? "")).toBe(true);
	});

	test("enforces length and character classes before touching the DB", async () => {
		await createTenant();
		const { user, token } = await invited();

		expect(await verifyEmailAndSetPassword(token, user.email, "Ab1")).toEqual({
			success: false,
			error: "Das Passwort muss mindestens 8 Zeichen lang sein.",
		});
		for (const weak of ["alllower1", "ALLUPPER1", "NoDigitsHere"]) {
			expect(await verifyEmailAndSetPassword(token, user.email, weak)).toEqual({
				success: false,
				error:
					"Das Passwort muss Groß- und Kleinbuchstaben sowie Zahlen enthalten.",
			});
		}
		expect(await tokenRows()).toHaveLength(1);
	});

	test("rejects a token issued for another address", async () => {
		await createTenant();
		const { token } = await invited();
		const other = await invited();

		expect(
			await verifyEmailAndSetPassword(token, other.user.email, PASSWORD),
		).toEqual({
			success: false,
			error: "Ungültiger oder abgelaufener Verifizierungstoken.",
		});
		expect((await identityOf(other.user.id))?.emailVerified).toBe(false);
	});

	test("rejects and deletes an expired token", async () => {
		await createTenant();
		const { user, token } = await invited({
			expires: new Date(Date.now() - 1000),
		});

		expect(
			await verifyEmailAndSetPassword(token, user.email, PASSWORD),
		).toEqual({
			success: false,
			error:
				"Der Verifizierungslink ist abgelaufen. Bitte wenden Sie sich an einen Administrator.",
		});
		expect(await tokenRows()).toHaveLength(0);
		expect((await identityOf(user.id))?.emailVerified).toBe(false);
	});

	test("refuses identities that are already verified or gone", async () => {
		await createTenant();
		const verified = await createUser();
		await tenantDb()
			.insert(verificationTokens)
			.values({
				identifier: verified.email,
				token: "t1",
				expires: new Date(Date.now() + 60_000),
			});
		await tenantDb()
			.insert(verificationTokens)
			.values({
				identifier: "ghost@example.test",
				token: "t2",
				expires: new Date(Date.now() + 60_000),
			});

		expect(
			await verifyEmailAndSetPassword("t1", verified.email, PASSWORD),
		).toEqual({
			success: false,
			error: "Diese E-Mail-Adresse wurde bereits verifiziert.",
		});
		expect(
			await verifyEmailAndSetPassword("t2", "ghost@example.test", PASSWORD),
		).toEqual({ success: false, error: "Benutzer nicht gefunden." });
		expect(await controlDb().select().from(accounts)).toHaveLength(0);
	});

	test("only accepts tokens issued by the current tenant", async () => {
		const issuer = await createTenant();
		const { user, token } = await invited({}, issuer.id);
		switchTenant(await createTenant());

		expect(
			await verifyEmailAndSetPassword(token, user.email, PASSWORD),
		).toEqual({
			success: false,
			error: "Ungültiger oder abgelaufener Verifizierungstoken.",
		});
	});
});
