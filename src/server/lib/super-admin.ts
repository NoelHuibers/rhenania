// super-admin.ts — platform-level superadmin checks.
//
// Superadmin is a property of the global identity, NOT a tenant role. Stored
// in `control.superAdmins` (separate table from `users` so user-update code
// paths physically cannot grant it).
//
// Use `requireSuperAdmin()` to gate /superadmin/* server actions and pages.

import { eq } from "drizzle-orm";

import { auth } from "~/server/auth";
import { controlDb } from "~/server/db/control";
import { superAdmins } from "~/server/db/control-schema";

export async function isSuperAdmin(userId: string): Promise<boolean> {
	const [row] = await controlDb
		.select({ userId: superAdmins.userId })
		.from(superAdmins)
		.where(eq(superAdmins.userId, userId))
		.limit(1);
	return Boolean(row);
}

export async function requireSuperAdmin(): Promise<{ userId: string }> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("Not authenticated");
	}
	const ok = await isSuperAdmin(session.user.id);
	if (!ok) {
		throw new Error("Superadmin required");
	}
	return { userId: session.user.id };
}
