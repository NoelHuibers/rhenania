"use server";

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { controlDb } from "~/server/db/control";
import {
	users as controlUsers,
	tenantMemberships,
} from "~/server/db/control-schema";
import { verificationTokens } from "~/server/db/schema";
import { ROLES } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { ConflictError } from "~/server/lib/domain-error";
import { forgetMembership } from "~/server/lib/tenant-context";
import { mirrorUserToTenant } from "~/server/lib/user-mirror";
import { checkAndUnlockAchievements } from "~/server/modules/achievements/tracking";
import { sendVerificationEmail } from "~/server/modules/mail/service";

/**
 * Invites `email` into the Admin's Corps: creates the identity unless it
 * exists (a member of another Corps keeps theirs), adds the membership and
 * mails a 24-hour link to set the password.
 */
export const createUser = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([
			z.object({
				email: z.string(),
				name: z.string().nullable().optional(),
			}),
		]),
		revalidate: ["/admin"],
		errorMessage: "Fehler beim Erstellen des Benutzers.",
	},
	async ([data], { tenant }) => {
		const { tenantId } = tenant;
		const email = data.email.toLowerCase();

		// Look up the user in the control DB (global identity).
		const [found] = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.email, email))
			.limit(1);

		let userRow: typeof controlUsers.$inferSelect;
		let isNew = false;

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
				throw new ConflictError(
					"Ein Benutzer mit dieser E-Mail-Adresse ist bereits Mitglied.",
					"ALREADY_MEMBER",
				);
			}
		} else {
			isNew = true;
			const now = tenant.now();
			userRow = {
				id: crypto.randomUUID(),
				email,
				name: data.name ?? null,
				image: null,
				emailVerified: false,
				createdAt: now,
				updatedAt: now,
			};
			await controlDb.insert(controlUsers).values(userRow);
		}

		// Add membership for this tenant.
		await controlDb.insert(tenantMemberships).values({
			userId: userRow.id,
			tenantId,
			status: "active",
		});
		forgetMembership(userRow.id, tenantId);

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
			const newUserId = userRow.id;
			after(() =>
				checkAndUnlockAchievements(tenant, newUserId, "account_created"),
			);
		}

		// Generate invitation token (tenant-scoped).
		const token = crypto.randomBytes(32).toString("hex");
		const expires = new Date(tenant.now().getTime() + 24 * 60 * 60 * 1000);

		await tenant.db.insert(verificationTokens).values({
			identifier: email,
			token,
			expires,
		});

		try {
			await sendVerificationEmail(data.email, token);
		} catch (emailError) {
			console.error("Error sending verification email:", emailError);
		}

		return {
			id: userRow.id,
			email: userRow.email,
			name: userRow.name,
			image: userRow.image,
			emailVerified: userRow.emailVerified,
		};
	},
);
