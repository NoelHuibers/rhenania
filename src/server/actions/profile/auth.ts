// ~/server/actions/auth.ts
"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { controlDb } from "~/server/db/control";
import { accounts } from "~/server/db/control-schema";
import { getCurrentTenantAzureConfig } from "~/server/lib/tenant-azure-config";

// Map a UI-facing provider name (e.g. "microsoft") to the per-tenant
// providerId stored in `accounts.providerId` (e.g. "microsoft-rhenania").
// Returns null if the current tenant doesn't have that provider configured.
async function resolveProviderId(uiName: string): Promise<string | null> {
	if (uiName === "microsoft") {
		const azure = await getCurrentTenantAzureConfig();
		return azure?.microsoftProviderId ?? null;
	}
	return uiName;
}

type ActionResult<T = void> = {
	success: boolean;
	error?: string;
	data?: T;
};

export async function getConnectedAccountsAction(): Promise<
	ActionResult<{
		accounts: Array<{ provider: string }>;
		hasPassword: boolean;
	}>
> {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return { success: false, error: "Unauthorized" };
		}

		const userAccounts = await controlDb
			.select({ provider: accounts.providerId })
			.from(accounts)
			.where(eq(accounts.userId, session.user.id));

		const credentialAccount = userAccounts.find(
			(a) => a.provider === "credential",
		);
		const hasPassword = credentialAccount !== undefined;

		// Normalize per-tenant providerIds (microsoft-<slug>) back to the UI
		// name "microsoft" for the current tenant; hide accounts belonging to
		// other tenants' Microsoft providers (the user may be a member of
		// multiple Corps with separate Microsoft links).
		const currentMicrosoftProviderId =
			(await resolveProviderId("microsoft")) ?? null;

		const visible = userAccounts
			.filter((a) => a.provider !== "credential")
			.filter(
				(a) =>
					a.provider === currentMicrosoftProviderId ||
					!a.provider.startsWith("microsoft-"),
			)
			.map((a) => ({
				provider:
					a.provider === currentMicrosoftProviderId ? "microsoft" : a.provider,
			}));

		return {
			success: true,
			data: {
				accounts: visible,
				hasPassword,
			},
		};
	} catch (error) {
		console.error("Error fetching connected accounts:", error);
		return { success: false, error: "Failed to fetch connected accounts" };
	}
}

export async function disconnectProviderAction(
	provider: string,
): Promise<ActionResult> {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return { success: false, error: "Unauthorized" };
		}

		if (!provider) {
			return { success: false, error: "Provider is required" };
		}

		const userAccounts = await controlDb
			.select({ provider: accounts.providerId, id: accounts.id })
			.from(accounts)
			.where(eq(accounts.userId, session.user.id));

		const hasPassword = userAccounts.some((a) => a.provider === "credential");
		const providerId = await resolveProviderId(provider);
		if (!providerId) {
			return {
				success: false,
				error: "Provider not configured for this tenant",
			};
		}

		if (!hasPassword && userAccounts.length <= 1) {
			return {
				success: false,
				error:
					"Cannot disconnect your only login method. Set up a password first.",
			};
		}

		await controlDb
			.delete(accounts)
			.where(
				and(
					eq(accounts.userId, session.user.id),
					eq(accounts.providerId, providerId),
				),
			);

		revalidatePath("/", "layout");
		return { success: true };
	} catch (error) {
		console.error("Error disconnecting provider:", error);
		return { success: false, error: "Failed to disconnect provider" };
	}
}

export async function changePasswordAction({
	currentPassword,
	newPassword,
}: {
	currentPassword?: string;
	newPassword: string;
}): Promise<ActionResult> {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return { success: false, error: "Unauthorized" };
		}

		if (!newPassword || newPassword.length < 8) {
			return {
				success: false,
				error: "New password must be at least 8 characters long",
			};
		}

		const credentialAccount = await controlDb
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, session.user.id),
					eq(accounts.providerId, "credential"),
				),
			)
			.limit(1);

		if (credentialAccount[0]?.password && currentPassword) {
			const isValidPassword = await bcrypt.compare(
				currentPassword,
				credentialAccount[0].password,
			);
			if (!isValidPassword) {
				return { success: false, error: "Current password is incorrect" };
			}
		} else if (credentialAccount[0]?.password && !currentPassword) {
			return { success: false, error: "Current password is required" };
		}

		const hashedPassword = await bcrypt.hash(newPassword, 12);

		if (credentialAccount[0]) {
			await controlDb
				.update(accounts)
				.set({ password: hashedPassword, updatedAt: new Date() })
				.where(
					and(
						eq(accounts.userId, session.user.id),
						eq(accounts.providerId, "credential"),
					),
				);
		} else {
			// No credential account yet — create one
			await controlDb.insert(accounts).values({
				accountId: session.user.email ?? session.user.id,
				providerId: "credential",
				userId: session.user.id,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		revalidatePath("/", "layout");
		return { success: true };
	} catch (error) {
		console.error("Error changing password:", error);
		return { success: false, error: "Failed to change password" };
	}
}

export async function connectProviderAction(
	provider: string,
): Promise<ActionResult<{ providerId: string }>> {
	try {
		const session = await auth();
		if (!session?.user?.id) {
			return { success: false, error: "Unauthorized" };
		}

		const providerId = await resolveProviderId(provider.toLowerCase());
		if (!providerId) {
			return {
				success: false,
				error: "Provider not configured for this tenant",
			};
		}

		// The client takes this providerId and calls
		// `authClient.signIn.oauth2({ providerId, callbackURL })` — a redirect
		// URL won't work because Better Auth's generic OAuth sign-in is a
		// POST endpoint.
		return { success: true, data: { providerId } };
	} catch (error) {
		console.error("Error connecting provider:", error);
		return { success: false, error: "Failed to connect provider" };
	}
}
