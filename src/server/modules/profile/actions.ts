"use server";

// actions.ts — the caller's profile and another member's public profile
// (#33). Check the caller and the input, then one call to the profile
// service. The changes answer with an ActionResult; the reads keep their
// old answers: a signed-out caller is sent to the sign-in page (own
// profile) or gets "Nicht angemeldet" (public profile), a failed read of
// the own profile throws "Failed to fetch user profile".

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "~/server/auth";
import { defineAction } from "~/server/lib/define-action";
import { ValidationError } from "~/server/lib/domain-error";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as profile from "./service";

export type { PublicAchievement } from "./service";

/** The caller's name, e-mail address, picture and roles. */
export async function getUserProfile() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}
	try {
		return await profile.myProfile(
			await scopeOf(session.tenantId),
			session.user.id,
		);
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
		await profile.updateIdentity(user.id, { name: name.data });
	},
);

/** Takes over the caller's Microsoft display name and photo. */
export const syncFromMicrosoft = defineAction(
	{
		errorMessage: "Abgleich mit Microsoft fehlgeschlagen",
		revalidate: ["/profile"],
	},
	async ({ user }) => profile.syncFromMicrosoft(user.id),
);

/** Re-renders /profile with fresh data. */
export const refreshProfile = defineAction(
	{ revalidate: ["/profile"] },
	async () => {
		// Nothing to do but the revalidation.
	},
);

/** Another member's public profile; members of this Corps only. */
export async function getPublicProfile(
	userId: string,
): Promise<profile.PublicProfileResult> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Nicht angemeldet");
	}
	return profile.publicProfile(await scopeOf(session.tenantId), userId);
}
