"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { controlDb } from "~/server/db/control";
import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { userRoles, verificationTokens } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { requireTenantId } from "~/server/lib/tenant-context";
import { mirrorUserToTenant } from "~/server/lib/user-mirror";
import { checkAndUnlockAchievements } from "../achievements/tracking";
import { sendVerificationEmail } from "./email";

// Check if user has admin role
async function checkAdminPermission() {
	const session = await auth();

	if (!session?.user?.id) {
		throw new Error("Nicht authentifiziert");
	}

	const hasAdminRole = session.user.roles?.includes("Admin");

	if (!hasAdminRole) {
		throw new Error("Keine Berechtigung für diese Aktion");
	}

	return session.user.id;
}

export async function toggleUserRole(userId: string, roleId: string) {
	await checkAdminPermission();
	const tenantId = await requireTenantId();
	const tdb = await getTenantDb(tenantId);

	try {
		const existingRole = await tdb
			.select()
			.from(userRoles)
			.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
			.limit(1);

		if (existingRole.length > 0) {
			await tdb
				.delete(userRoles)
				.where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
		} else {
			await tdb.insert(userRoles).values({
				userId,
				roleId,
				assignedAt: new Date(),
			});
		}

		revalidatePath("/admin");
		return { success: true };
	} catch (error) {
		console.error("Error toggling user role:", error);
		throw new Error("Fehler beim Ändern der Rolle");
	}
}

interface CreateUserData {
	email: string;
	name?: string | null;
}

interface CreateUserResult {
	success: boolean;
	user?: {
		id: string;
		email: string;
		name: string | null;
		image: string | null;
		emailVerified: boolean | null;
	};
	error?: string;
}

export async function createUser(
	data: CreateUserData,
): Promise<CreateUserResult> {
	await checkAdminPermission();
	const tenantId = await requireTenantId();
	const tdb = await getTenantDb(tenantId);
	const email = data.email.toLowerCase();

	try {
		// Look up the user in the control DB (global identity).
		const existingUser = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.email, email))
			.limit(1);

		let userRow:
			| {
					id: string;
					email: string;
					name: string | null;
					image: string | null;
					emailVerified: boolean;
					createdAt: Date;
					updatedAt: Date;
			  }
			| undefined;
		let isNew = false;

		const found = existingUser[0];
		if (found) {
			userRow = found;
			// If they already belong to this tenant, that's a conflict.
			const [existingMembership] = await controlDb
				.select({ userId: tenantMemberships.userId })
				.from(tenantMemberships)
				.where(
					and(
						eq(tenantMemberships.userId, found.id),
						eq(tenantMemberships.tenantId, tenantId),
					),
				)
				.limit(1);
			if (existingMembership) {
				return {
					success: false,
					error: "Ein Benutzer mit dieser E-Mail-Adresse ist bereits Mitglied.",
				};
			}
		} else {
			isNew = true;
			const now = new Date();
			const newUser = {
				id: crypto.randomUUID(),
				email,
				name: data.name ?? null,
				image: null,
				emailVerified: false,
				createdAt: now,
				updatedAt: now,
			};
			await controlDb.insert(controlUsers).values(newUser);
			userRow = newUser;
		}

		if (!userRow) {
			return { success: false, error: "Fehler beim Erstellen des Benutzers." };
		}

		// Add membership for this tenant.
		await controlDb.insert(tenantMemberships).values({
			userId: userRow.id,
			tenantId,
			status: "active",
		});

		// Mirror to tenant DB so existing joins work.
		await mirrorUserToTenant(
			{
				id: userRow.id,
				name: userRow.name,
				email: userRow.email,
				emailVerified: userRow.emailVerified,
				image: userRow.image,
				createdAt: userRow.createdAt,
				updatedAt: userRow.updatedAt,
			},
			tenantId,
		);

		if (isNew) {
			void checkAndUnlockAchievements(userRow.id, "account_created");
		}

		// Generate invitation token (tenant-scoped).
		const token = crypto.randomBytes(32).toString("hex");
		const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

		await tdb.insert(verificationTokens).values({
			identifier: email,
			token,
			expires,
		});

		try {
			await sendVerificationEmail(data.email, token);
		} catch (emailError) {
			console.error("Error sending verification email:", emailError);
		}

		revalidatePath("/admin");

		return {
			success: true,
			user: {
				id: userRow.id,
				email: userRow.email,
				name: userRow.name,
				image: userRow.image,
				emailVerified: userRow.emailVerified,
			},
		};
	} catch (error) {
		console.error("Error creating user:", error);
		return {
			success: false,
			error: "Fehler beim Erstellen des Benutzers.",
		};
	}
}

export async function resendVerificationEmail(email: string) {
	await checkAdminPermission();
	const tenantId = await requireTenantId();
	const tdb = await getTenantDb(tenantId);
	const lowerEmail = email.toLowerCase();

	try {
		const user = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.email, lowerEmail))
			.limit(1);

		if (user.length === 0) {
			return {
				success: false,
				error: "Benutzer nicht gefunden.",
			};
		}

		if (user[0]?.emailVerified) {
			return {
				success: false,
				error: "E-Mail-Adresse ist bereits verifiziert.",
			};
		}

		await tdb
			.delete(verificationTokens)
			.where(eq(verificationTokens.identifier, lowerEmail));

		const token = crypto.randomBytes(32).toString("hex");
		const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

		await tdb.insert(verificationTokens).values({
			identifier: lowerEmail,
			token,
			expires,
		});

		await sendVerificationEmail(email, token);

		return { success: true };
	} catch (error) {
		console.error("Error resending verification email:", error);
		return {
			success: false,
			error: "Fehler beim Senden der Verifizierungs-E-Mail.",
		};
	}
}
