"use server";

import {
	type AuthenticationProvider,
	Client,
} from "@microsoft/microsoft-graph-client";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { getGraphAccessToken } from "~/server/auth/microsoft-tokens";
import { db } from "~/server/db";
import { roles, userRoles, users } from "~/server/db/schema";
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
		throw new Error("User not found");
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

// Update user name
export async function updateUserName(formData: FormData) {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	const name = formData.get("name") as string;

	if (!name || name.trim().length === 0) {
		throw new Error("Name is required");
	}

	if (name.trim().length > 255) {
		throw new Error("Name is too long");
	}

	try {
		await updateIdentityOrThrow(session.user.id, { name: name.trim() });

		revalidatePath("/profile");
		return { success: true, message: "Name updated successfully" };
	} catch (error) {
		console.error("Error updating user name:", error);
		throw new Error("Failed to update name");
	}
}

// Sync profile from Microsoft Graph API
export async function syncFromMicrosoft() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/auth/signin");
	}
	const token = await getGraphAccessToken(session.user.id);

	// Check if user has access token (logged in via Microsoft)
	if (!token) {
		throw new Error(
			"Microsoft access token not available. Please sign in with Microsoft to sync profile.",
		);
	}

	try {
		// Fetch user profile from Microsoft Graph
		const graphUser = await fetchUserProfile(token);

		// Fetch user photo from Microsoft Graph
		const photoUrl = await fetchUserPhoto(token);

		// Prepare update data
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

		// Only update if we have data to update
		if (Object.keys(updateData).length > 0) {
			await updateIdentityOrThrow(session.user.id, updateData);
		}

		revalidatePath("/profile");

		return {
			success: true,
			message: `Profile synced from Microsoft successfully. Updated: ${Object.keys(
				updateData,
			).join(", ")}`,
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
	} catch (error) {
		console.error("Error syncing from Microsoft:", error);
		throw new Error(
			`Failed to sync from Microsoft: ${
				error instanceof Error ? error.message : "Unknown error"
			}`,
		);
	}
}

// Refresh profile data (re-fetch from database)
export async function refreshProfile() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	try {
		// Just revalidate the path to trigger a fresh data fetch
		revalidatePath("/profile");
		return { success: true, message: "Profile refreshed successfully" };
	} catch (error) {
		console.error("Error refreshing profile:", error);
		throw new Error("Failed to refresh profile");
	}
}
