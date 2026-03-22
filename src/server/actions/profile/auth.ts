// ~/server/actions/auth.ts
"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";

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

		const userAccounts = await db
			.select({ provider: accounts.providerId })
			.from(accounts)
			.where(eq(accounts.userId, session.user.id));

		const credentialAccount = userAccounts.find(
			(a) => a.provider === "credential",
		);
		const hasPassword = credentialAccount !== undefined;

		return {
			success: true,
			data: {
				accounts: userAccounts.filter((a) => a.provider !== "credential"),
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

		const userAccounts = await db
			.select({ provider: accounts.providerId, id: accounts.id })
			.from(accounts)
			.where(eq(accounts.userId, session.user.id));

		const hasPassword = userAccounts.some((a) => a.provider === "credential");
		const providerName = provider === "microsoft" ? "microsoft" : provider;

		if (!hasPassword && userAccounts.length <= 1) {
			return {
				success: false,
				error:
					"Cannot disconnect your only login method. Set up a password first.",
			};
		}

		await db
			.delete(accounts)
			.where(
				and(
					eq(accounts.userId, session.user.id),
					eq(accounts.providerId, providerName),
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

		const credentialAccount = await db
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
			await db
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
			await db.insert(accounts).values({
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
): Promise<ActionResult<{ redirectUrl: string }>> {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return { success: false, error: "Unauthorized" };
		}

		const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
		const callbackURL = encodeURIComponent(`${baseUrl}/account/security`);

		let redirectUrl: string;

		switch (provider.toLowerCase()) {
			case "microsoft":
				redirectUrl = `/api/auth/sign-in/microsoft-entra-id?callbackURL=${callbackURL}`;
				break;
			default:
				return { success: false, error: "Unsupported provider" };
		}

		return { success: true, data: { redirectUrl } };
	} catch (error) {
		console.error("Error connecting provider:", error);
		return { success: false, error: "Failed to connect provider" };
	}
}
