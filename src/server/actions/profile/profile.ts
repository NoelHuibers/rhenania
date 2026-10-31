"use server";

import {
	type AuthenticationProvider,
	Client,
} from "@microsoft/microsoft-graph-client";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/server/auth";
import { getGraphAccessToken } from "~/server/auth/microsoft-tokens";
import { db } from "~/server/db";
import { roles, userRoles, users } from "~/server/db/schema";
import { ActionError, defineAction } from "~/server/lib/define-action";
import { NotFoundError, ValidationError } from "~/server/lib/domain-error";
import { log } from "~/server/lib/log";
import { updateUserIdentity } from "~/server/lib/user-mirror";

// Microsoft Graph API integration
class CustomAuthProvider implements AuthenticationProvider {
	constructor(private accessToken: string) {}

	async getAccessToken(): Promise<string> {
		return this.accessToken;
	}
}

function createGraphClient(accessToken: string): Client {
	const authProvider = new CustomAuthProvider(accessToken);
	return Client.initWithMiddleware({ authProvider });
}

interface GraphUser {
	id?: string;
	displayName?: string;
	mail?: string;
	userPrincipalName?: string;
	jobTitle?: string;
	department?: string;
	officeLocation?: string;
	mobilePhone?: string;
	businessPhones?: string[];
}

async function fetchUserProfile(accessToken: string): Promise<GraphUser> {
	const graphClient = createGraphClient(accessToken);

	try {
		const user = await graphClient
			.api("/me")
			.select([
				"id",
				"displayName",
				"mail",
				"userPrincipalName",
				"jobTitle",
				"department",
				"officeLocation",
				"mobilePhone",
				"businessPhones",
			])
			.get();

		return user as GraphUser;
	} catch (error) {
		console.error("Error fetching user profile from Graph:", error);
		throw new Error("Failed to fetch user profile from Microsoft Graph");
	}
}

async function fetchUserPhoto(accessToken: string): Promise<string | null> {
	try {
		// Check if user has a photo using Graph client
		const graphClient = createGraphClient(accessToken);
		const photoMetadata = await graphClient.api("/me/photo").get();

		if (!photoMetadata) {
			return null;
		}

		// Use fetch directly for binary data
		const photoResponse = await fetch(
			"https://graph.microsoft.com/v1.0/me/photo/$value",
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
			},
		);

		if (!photoResponse.ok) {
			return null;
		}

		// Spreading the bytes into String.fromCharCode overflows the call
		// stack for large photos; Buffer encodes any size.
		const arrayBuffer = await photoResponse.arrayBuffer();
		const base64String = Buffer.from(arrayBuffer).toString("base64");
		const mimeType = photoMetadata["@odata.mediaContentType"] || "image/jpeg";

		return `data:${mimeType};base64,${base64String}`;
	} catch (error) {
		await log.info("microsoft photo not synced", { reason: String(error) });
		return null;
	}
}

// Profile fields live on the global identity; tenant rows are mirrors.
async function updateIdentityOrThrow(
	userId: string,
	patch: { name?: string | null; image?: string | null },
): Promise<void> {
	const updated = await updateUserIdentity(userId, patch);
	if (!updated) {
		throw new NotFoundError("Benutzer nicht gefunden");
	}
}

// Get user profile data
export async function getUserProfile() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/auth/signin");
	}
	try {
		const [userProfile] = await db
			.select({
				id: users.id,
				name: users.name,
				email: users.email,
				image: users.image,
			})
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		if (!userProfile) {
			throw new Error("User not found");
		}

		// Get user roles
		const userRoleRows = await db
			.select({
				roleName: roles.name,
				roleDescription: roles.description,
			})
			.from(userRoles)
			.innerJoin(roles, eq(userRoles.roleId, roles.id))
			.where(eq(userRoles.userId, session.user.id));

		return {
			...userProfile,
			roles: userRoleRows.map((r) => r.roleName),
		};
	} catch (error) {
		console.error("Error fetching user profile:", error);
		throw new Error("Failed to fetch user profile");
	}
}

const nameSchema = z
	.string({ error: "Bitte gib einen Namen ein" })
	.trim()
	.min(1, "Bitte gib einen Namen ein")
	.max(255, "Der Name darf höchstens 255 Zeichen lang sein");

/** Renames the caller (form field `name`), on the global identity. */
export const updateUserName = defineAction(
	{
		schema: z.tuple([z.instanceof(FormData)]),
		errorMessage: "Name konnte nicht geändert werden",
		revalidate: ["/profile"],
	},
	async ([formData], { user }) => {
		const name = nameSchema.safeParse(formData.get("name") ?? "");
		if (!name.success) {
			throw new ValidationError(
				name.error.issues[0]?.message ?? "Ungültiger Name",
			);
		}
		await updateIdentityOrThrow(user.id, { name: name.data });
	},
);

const FIELD_LABELS = { name: "Name", image: "Profilbild" } as const;

/** Takes over the caller's Microsoft display name and photo. */
export const syncFromMicrosoft = defineAction(
	{
		errorMessage: "Abgleich mit Microsoft fehlgeschlagen",
		revalidate: ["/profile"],
	},
	async ({ user }) => {
		const token = await getGraphAccessToken(user.id);
		// Only members signed in with Microsoft have a token.
		if (!token) {
			throw new ActionError(
				"Kein Microsoft-Zugang verfügbar. Melde dich mit Microsoft an, um dein Profil abzugleichen.",
				"NO_MICROSOFT_TOKEN",
			);
		}

		const graphUser = await fetchUserProfile(token);
		const photoUrl = await fetchUserPhoto(token);

		const updateData: Partial<{
			name: string | null;
			image: string | null;
		}> = {};
		if (graphUser.displayName) {
			updateData.name = graphUser.displayName;
		}
		if (photoUrl) {
			updateData.image = photoUrl;
		}

		const updated = Object.keys(updateData) as (keyof typeof updateData)[];
		if (updated.length > 0) {
			await updateIdentityOrThrow(user.id, updateData);
		}

		return {
			message:
				updated.length > 0
					? `Profil mit Microsoft abgeglichen. Aktualisiert: ${updated
							.map((key) => FIELD_LABELS[key])
							.join(", ")}`
					: "Profil mit Microsoft abgeglichen. Nichts zu aktualisieren.",
			syncedData: {
				name: graphUser.displayName,
				hasPhoto: !!photoUrl,
				email: graphUser.mail || graphUser.userPrincipalName,
				jobTitle: graphUser.jobTitle,
				department: graphUser.department,
				officeLocation: graphUser.officeLocation,
				mobilePhone: graphUser.mobilePhone,
				businessPhones: graphUser.businessPhones,
			},
		};
	},
);

/** Re-renders /profile with fresh data. */
export const refreshProfile = defineAction(
	{ revalidate: ["/profile"] },
	async () => {
		// Nothing to do but the revalidation.
	},
);
