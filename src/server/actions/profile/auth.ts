// ~/server/actions/auth.ts
"use server";

// The caller's sign-in methods: linked providers and the password. The
// accounts live in the control DB (one login across all Corps). Every
// action answers with an ActionResult (#216).

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { controlDb } from "~/server/db/control";
import { accounts } from "~/server/db/control-schema";
import { ActionError, defineAction } from "~/server/lib/define-action";
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

const PROVIDER_NOT_CONFIGURED =
	"Dieser Anbieter ist für deine Verbindung nicht eingerichtet";
const PASSWORD_TOO_SHORT =
	"Das neue Passwort muss mindestens 8 Zeichen lang sein";

export const getConnectedAccountsAction = defineAction(
	{ errorMessage: "Verbundene Konten konnten nicht geladen werden" },
	async ({ user }) => {
		const userAccounts = await controlDb
			.select({ provider: accounts.providerId })
			.from(accounts)
			.where(eq(accounts.userId, user.id));

		const hasPassword = userAccounts.some((a) => a.provider === "credential");

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

		return { accounts: visible, hasPassword };
	},
);

export const disconnectProviderAction = defineAction(
	{
		schema: z.tuple([z.string().min(1, "Anbieter fehlt")]),
		errorMessage: "Konto konnte nicht getrennt werden",
	},
	async ([provider], { user }) => {
		const userAccounts = await controlDb
			.select({ provider: accounts.providerId, id: accounts.id })
			.from(accounts)
			.where(eq(accounts.userId, user.id));

		const hasPassword = userAccounts.some((a) => a.provider === "credential");
		const providerId = await resolveProviderId(provider);
		if (!providerId) {
			throw new ActionError(PROVIDER_NOT_CONFIGURED, "NOT_CONFIGURED");
		}

		if (!hasPassword && userAccounts.length <= 1) {
			throw new ActionError(
				"Das ist deine einzige Anmeldemethode. Lege zuerst ein Passwort fest.",
				"LAST_LOGIN_METHOD",
			);
		}

		await controlDb
			.delete(accounts)
			.where(
				and(eq(accounts.userId, user.id), eq(accounts.providerId, providerId)),
			);

		revalidatePath("/", "layout");
	},
);

export const changePasswordAction = defineAction(
	{
		schema: z.tuple([
			z.object({
				currentPassword: z.string().optional(),
				newPassword: z
					.string({ error: PASSWORD_TOO_SHORT })
					.min(8, PASSWORD_TOO_SHORT),
			}),
		]),
		errorMessage: "Passwort konnte nicht geändert werden",
	},
	async ([{ currentPassword, newPassword }], { user }) => {
		const [credentialAccount] = await controlDb
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, user.id),
					eq(accounts.providerId, "credential"),
				),
			)
			.limit(1);

		if (credentialAccount?.password && currentPassword) {
			const isValidPassword = await bcrypt.compare(
				currentPassword,
				credentialAccount.password,
			);
			if (!isValidPassword) {
				throw new ActionError(
					"Das aktuelle Passwort ist falsch",
					"WRONG_PASSWORD",
				);
			}
		} else if (credentialAccount?.password && !currentPassword) {
			throw new ActionError(
				"Bitte gib dein aktuelles Passwort ein",
				"INVALID_INPUT",
			);
		}

		const hashedPassword = await bcrypt.hash(newPassword, 12);

		if (credentialAccount) {
			await controlDb
				.update(accounts)
				.set({ password: hashedPassword, updatedAt: new Date() })
				.where(
					and(
						eq(accounts.userId, user.id),
						eq(accounts.providerId, "credential"),
					),
				);
		} else {
			// No credential account yet — create one
			await controlDb.insert(accounts).values({
				accountId: user.email ?? user.id,
				providerId: "credential",
				userId: user.id,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		revalidatePath("/", "layout");
	},
);

export const connectProviderAction = defineAction(
	{
		schema: z.tuple([z.string()]),
		errorMessage: "Konto konnte nicht verknüpft werden",
	},
	async ([provider]) => {
		const providerId = await resolveProviderId(provider.toLowerCase());
		if (!providerId) {
			throw new ActionError(PROVIDER_NOT_CONFIGURED, "NOT_CONFIGURED");
		}

		// The client takes this providerId and calls
		// `authClient.signIn.social({ provider: providerId, callbackURL })` —
		// a redirect URL won't work because Better Auth's social sign-in is a
		// POST endpoint.
		return { providerId };
	},
);
