import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { accounts } from "~/server/db/control-schema";
import {
	createAccount,
	microsoftConfig,
	setAuthConfig,
} from "../../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import {
	changePasswordAction,
	connectProviderAction,
	disconnectProviderAction,
	getConnectedAccountsAction,
} from "./auth";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function hassiaMember() {
	const tenant = await createTenant({ slug: "hassia" });
	await setAuthConfig(tenant.id, microsoftConfig());
	const member = await createUser();
	signInAs(member);
	return member;
}

const providersOf = async (userId: string) =>
	(
		await controlDb()
			.select({ providerId: accounts.providerId })
			.from(accounts)
			.where(eq(accounts.userId, userId))
	)
		.map((a) => a.providerId)
		.sort();

describe("getConnectedAccountsAction", () => {
	test("shows this Corps' Microsoft link as 'microsoft' and hides other Corps' links", async () => {
		const member = await hassiaMember();
		await createAccount(member.id, "credential", { password: "hash" });
		await createAccount(member.id, "microsoft-hassia");
		await createAccount(member.id, "microsoft-rhenania");
		await createAccount(member.id, "github");

		expect(await getConnectedAccountsAction()).toEqual({
			success: true,
			data: {
				accounts: [{ provider: "microsoft" }, { provider: "github" }],
				hasPassword: true,
			},
		});
	});

	test("without Microsoft configured, no per-Corps link is shown", async () => {
		await createTenant({ slug: "hassia" });
		const member = await createUser();
		signInAs(member);
		await createAccount(member.id, "microsoft-hassia");

		expect(await getConnectedAccountsAction()).toEqual({
			success: true,
			data: { accounts: [], hasPassword: false },
		});
	});

	test("anonymous callers are rejected", async () => {
		await createTenant();
		expect(await getConnectedAccountsAction()).toEqual({
			success: false,
			error: "Unauthorized",
		});
	});
});

describe("disconnectProviderAction", () => {
	test("unlinks this Corps' Microsoft account when a password exists", async () => {
		const member = await hassiaMember();
		await createAccount(member.id, "credential", { password: "hash" });
		await createAccount(member.id, "microsoft-hassia");
		await createAccount(member.id, "microsoft-rhenania");

		expect(await disconnectProviderAction("microsoft")).toEqual({
			success: true,
		});
		expect(await providersOf(member.id)).toEqual([
			"credential",
			"microsoft-rhenania",
		]);
	});

	test("refuses to remove the only way to sign in", async () => {
		const member = await hassiaMember();
		await createAccount(member.id, "microsoft-hassia");

		expect(await disconnectProviderAction("microsoft")).toEqual({
			success: false,
			error:
				"Cannot disconnect your only login method. Set up a password first.",
		});
		expect(await providersOf(member.id)).toEqual(["microsoft-hassia"]);
	});

	test("validates the provider", async () => {
		await createTenant();
		signInAs(await createUser());

		expect(await disconnectProviderAction("")).toEqual({
			success: false,
			error: "Provider is required",
		});
		expect(await disconnectProviderAction("microsoft")).toEqual({
			success: false,
			error: "Provider not configured for this tenant",
		});
	});
});

describe("changePasswordAction", () => {
	test("changes the password after checking the current one", async () => {
		const member = await hassiaMember();
		await createAccount(member.id, "credential", {
			password: await bcrypt.hash("Alt12345", 4),
		});

		expect(
			await changePasswordAction({
				currentPassword: "Falsch123",
				newPassword: "Neu123456",
			}),
		).toEqual({ success: false, error: "Current password is incorrect" });
		expect(await changePasswordAction({ newPassword: "Neu123456" })).toEqual({
			success: false,
			error: "Current password is required",
		});
		expect(
			await changePasswordAction({
				currentPassword: "Alt12345",
				newPassword: "Neu123456",
			}),
		).toEqual({ success: true });

		const [account] = await controlDb()
			.select()
			.from(accounts)
			.where(eq(accounts.userId, member.id));
		expect(await bcrypt.compare("Neu123456", account?.password ?? "")).toBe(
			true,
		);
	});

	test("lets Microsoft-only members set a first password", async () => {
		const member = await hassiaMember();
		await createAccount(member.id, "microsoft-hassia");

		expect(await changePasswordAction({ newPassword: "Erstes123" })).toEqual({
			success: true,
		});

		const [credential] = await controlDb()
			.select()
			.from(accounts)
			.where(eq(accounts.providerId, "credential"));
		expect(credential).toMatchObject({
			userId: member.id,
			accountId: member.email,
		});
		expect(await bcrypt.compare("Erstes123", credential?.password ?? "")).toBe(
			true,
		);
	});

	test("rejects short passwords and anonymous callers", async () => {
		await createTenant();
		expect(await changePasswordAction({ newPassword: "Lang12345" })).toEqual({
			success: false,
			error: "Unauthorized",
		});

		signInAs(await createUser());
		expect(await changePasswordAction({ newPassword: "kurz" })).toEqual({
			success: false,
			error: "New password must be at least 8 characters long",
		});
		expect(await controlDb().select().from(accounts)).toHaveLength(0);
	});
});

describe("connectProviderAction", () => {
	test("returns this Corps' provider id for the OAuth sign-in", async () => {
		await hassiaMember();

		expect(await connectProviderAction("Microsoft")).toEqual({
			success: true,
			data: { providerId: "microsoft-hassia" },
		});
	});

	test("fails when the Corps has no Microsoft config", async () => {
		await createTenant();
		signInAs(await createUser());

		expect(await connectProviderAction("microsoft")).toEqual({
			success: false,
			error: "Provider not configured for this tenant",
		});
	});
});
