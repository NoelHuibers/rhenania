// service.ts — the member's profile and another member's public profile
// (#33).
//
// Every function takes the TenantScope it works in. The name and picture
// live on the global identity (control DB) and are mirrored into every
// Corps (lib/user-mirror.ts); the Microsoft sync reads them from Graph.
// Failures the user should read are DomainErrors.

import "server-only";

import {
	type AuthenticationProvider,
	Client,
} from "@microsoft/microsoft-graph-client";
import type { UserStats } from "~/components/profile/KPIGrid";
import { getGraphAccessToken } from "~/server/auth/microsoft-tokens";
import { ActionError } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";
import { log } from "~/server/lib/log";
import type { TenantScope } from "~/server/lib/tenant-scope";
import { updateUserIdentity } from "~/server/lib/user-mirror";
import { unlockPercentages } from "~/server/modules/achievements/service";
import {
	type EloHistoryPoint,
	eloStatsOf,
} from "~/server/modules/games/service";
import {
	isEloEnabled,
	isPublicProfileEnabled,
} from "~/server/modules/preferences/service";
import * as repo from "./repo";

// ─── The member's own profile ────────────────────────────────────────────────

/** The member's name, e-mail address, picture and role names. */
export async function myProfile(
	{ db }: TenantScope,
	identity: {
		id: string;
		name: string | null;
		email: string;
		image: string | null;
	},
) {
	const userId = identity.id;
	// Without a mirror row (#35 drift) the signed-in identity says the same:
	// the mirror is a copy of it. No mirror row means no roles here either.
	const userProfile = (await repo.profileRow(db, userId)) ?? {
		id: userId,
		name: identity.name,
		email: identity.email,
		image: identity.image,
	};
	const userRoleRows = await repo.rolesWithDescriptions(db, userId);
	return {
		...userProfile,
		roles: userRoleRows.map((r) => r.roleName),
	};
}

// Profile fields live on the global identity; tenant rows are mirrors.
export async function updateIdentity(
	userId: string,
	patch: { name?: string | null; image?: string | null },
): Promise<void> {
	const updated = await updateUserIdentity(userId, patch);
	if (!updated) {
		throw new NotFoundError("Benutzer nicht gefunden");
	}
}

// ─── Microsoft Graph ─────────────────────────────────────────────────────────

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

const FIELD_LABELS = { name: "Name", image: "Profilbild" } as const;

/** Takes over the member's Microsoft display name and photo. */
export async function syncFromMicrosoft(userId: string) {
	const token = await getGraphAccessToken(userId);
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
		await updateIdentity(userId, updateData);
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
}

// ─── Another member's public profile ─────────────────────────────────────────

export type PublicAchievement = {
	id: string;
	name: string;
	description: string;
	category: "drinking" | "games" | "social" | "financial" | "time" | "special";
	icon: string | null;
	points: number;
	rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
	unlockedAt: Date | null;
	unlockPercent: number;
};

export type PublicProfileUser = {
	id: string;
	name: string | null;
	image: string | null;
};

export type PublicProfileResult =
	| { status: "not_found" }
	| { status: "private"; user: PublicProfileUser }
	| {
			status: "public";
			user: PublicProfileUser & { roles: string[] };
			achievements: PublicAchievement[];
			totalPoints: number;
			elo: { stats: UserStats; eloHistory: EloHistoryPoint[] } | null;
			drinkStats: { litersLast6Months: number };
	  };

/**
 * Another member's public view. Deliberately never selects the e-mail
 * address, member record, billing or payment data, only gamified stats.
 * The tenant DB is per Corps, so a `user` row proves same-Corps membership.
 */
export async function publicProfile(
	tenant: TenantScope,
	userId: string,
): Promise<PublicProfileResult> {
	const { db } = tenant;
	const targetUser = await repo.publicUser(db, userId);
	if (!targetUser) {
		return { status: "not_found" };
	}

	if (!(await isPublicProfileEnabled(tenant, userId))) {
		return { status: "private", user: targetUser };
	}

	const [roleRows, unlockedRows, percentages, eloEnabled, litersRow] =
		await Promise.all([
			repo.roleNames(db, userId),
			repo.unlockedAchievements(db, userId),
			unlockPercentages(tenant),
			isEloEnabled(tenant, userId),
			repo.personalLitresLastSixMonths(db, userId),
		]);

	const publicAchievements: PublicAchievement[] = unlockedRows.map((a) => ({
		...a,
		unlockPercent: percentages[a.id] ?? 0,
	}));

	const elo = eloEnabled ? await eloStatsOf(tenant, userId) : null;

	return {
		status: "public",
		user: { ...targetUser, roles: roleRows.map((r) => r.roleName) },
		achievements: publicAchievements,
		totalPoints: publicAchievements.reduce((sum, a) => sum + a.points, 0),
		elo,
		drinkStats: {
			litersLast6Months:
				Math.round(Number(litersRow[0]?.liters ?? 0) * 100) / 100,
		},
	};
}
