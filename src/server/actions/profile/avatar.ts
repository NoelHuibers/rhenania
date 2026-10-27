// ~/server/actions/profile/avatar-upload.ts
"use server";

import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { isTenantBlobUrl } from "~/server/lib/blob-url";
import {
	requireCurrentTenant,
	requireTenantId,
} from "~/server/lib/tenant-context";
import { checkAndUnlockAchievements } from "../achievements/tracking";

/**
 * Only blobs in the caller's own avatar folder may ever be deleted. Without
 * this, pointing your avatar at someone else's blob (a receipt, another
 * member's photo, another Corps' file) and then changing it again would
 * delete that file.
 */
function isOwnAvatarBlob(
	url: string | null | undefined,
	slug: string,
	userId: string,
): url is string {
	return isTenantBlobUrl(url, slug, `profile/${userId}/`);
}

function isHttpsUrl(url: string) {
	try {
		return new URL(url).protocol === "https:";
	} catch {
		return false;
	}
}

export async function updateUserAvatarWithUpload(formData: FormData) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return {
				success: false,
				message: "Nicht authentifiziert",
			};
		}

		const file = formData.get("file") as File;

		if (!file) {
			return {
				success: false,
				message: "Keine Datei hochgeladen",
			};
		}

		// Validate file type
		const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			return {
				success: false,
				message: "Ungültiger Dateityp. Erlaubt sind: JPEG, PNG, WebP",
			};
		}

		// Validate file size (5MB max for profile pictures)
		const maxSize = 5 * 1024 * 1024; // 5MB
		if (file.size > maxSize) {
			return {
				success: false,
				message: "Datei ist zu groß. Maximum: 5MB",
			};
		}

		// Get current user to check for existing image
		const currentUser = await db
			.select({ image: users.image })
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		const _oldImageUrl = currentUser[0]?.image;

		// For now, we'll return instructions for client-side upload
		return {
			success: true,
			requiresClientUpload: true,
			message: "Datei bereit zum Upload",
		};
	} catch (error) {
		console.error("Avatar upload error:", error);
		return {
			success: false,
			message: error instanceof Error ? error.message : "Upload fehlgeschlagen",
		};
	}
}

export async function updateUserAvatarUrl(formData: FormData) {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return {
				success: false,
				message: "Nicht authentifiziert",
			};
		}

		const imageUrl = formData.get("imageUrl") as string;

		if (!imageUrl) {
			return {
				success: false,
				message: "Keine Bild-URL angegeben",
			};
		}
		if (!isHttpsUrl(imageUrl)) {
			return { success: false, message: "Nur https-Bild-URLs sind erlaubt" };
		}
		const { slug } = await requireCurrentTenant();

		// Get current user to check for existing Vercel Blob image
		const currentUser = await db
			.select({ image: users.image })
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		const oldImageUrl = currentUser[0]?.image;

		// Delete the previous upload, but only if it is this user's own avatar.
		if (
			oldImageUrl !== imageUrl &&
			isOwnAvatarBlob(oldImageUrl, slug, session.user.id)
		) {
			try {
				await del(oldImageUrl);
			} catch (error) {
				console.error("Failed to delete old avatar:", error);
				// Continue even if deletion fails
			}
		}

		// Update user avatar in database
		await db
			.update(users)
			.set({ image: imageUrl })
			.where(eq(users.id, session.user.id));

		const userId = session.user.id;
		const tenantId = await requireTenantId();
		after(() =>
			checkAndUnlockAchievements(userId, "profile_picture_set", undefined, {
				tenantId,
			}),
		);

		revalidatePath("/profile");
		revalidatePath("/leaderboard");
		revalidatePath("/eloranking");

		return {
			success: true,
			message: "Profilbild erfolgreich aktualisiert",
			imageUrl,
		};
	} catch (error) {
		console.error("Avatar URL update error:", error);
		return {
			success: false,
			message: error instanceof Error ? error.message : "Update fehlgeschlagen",
		};
	}
}

export async function deleteUserAvatar() {
	try {
		const session = await auth();

		if (!session?.user?.id) {
			return {
				success: false,
				message: "Nicht authentifiziert",
			};
		}

		// Get current user image
		const currentUser = await db
			.select({ image: users.image })
			.from(users)
			.where(eq(users.id, session.user.id))
			.limit(1);

		const imageUrl = currentUser[0]?.image;
		const { slug } = await requireCurrentTenant();

		if (isOwnAvatarBlob(imageUrl, slug, session.user.id)) {
			try {
				await del(imageUrl);
			} catch (error) {
				console.error("Failed to delete avatar from blob storage:", error);
			}
		}

		// Set image to null in database
		await db
			.update(users)
			.set({ image: null })
			.where(eq(users.id, session.user.id));

		revalidatePath("/profile");
		revalidatePath("/leaderboard");
		revalidatePath("/eloranking");

		return {
			success: true,
			message: "Profilbild erfolgreich gelöscht",
		};
	} catch (error) {
		console.error("Delete avatar error:", error);
		return {
			success: false,
			message:
				error instanceof Error ? error.message : "Löschen fehlgeschlagen",
		};
	}
}
