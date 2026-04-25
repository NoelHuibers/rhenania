"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { controlDb } from "~/server/db/control";
import {
	accounts,
	users as controlUsers,
	passwordResetTokens,
} from "~/server/db/control-schema";
import { verificationTokens } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { requireTenantId } from "~/server/lib/tenant-context";
import { mirrorUserToAllMemberTenants } from "~/server/lib/user-mirror";

interface VerifyEmailResult {
	success: boolean;
	error?: string;
}

export async function verifyEmailAndSetPassword(
	token: string,
	email: string,
	password: string,
): Promise<VerifyEmailResult> {
	try {
		// Validate password requirements
		if (password.length < 8) {
			return {
				success: false,
				error: "Das Passwort muss mindestens 8 Zeichen lang sein.",
			};
		}

		const hasUpperCase = /[A-Z]/.test(password);
		const hasLowerCase = /[a-z]/.test(password);
		const hasNumbers = /\d/.test(password);

		if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
			return {
				success: false,
				error:
					"Das Passwort muss Groß- und Kleinbuchstaben sowie Zahlen enthalten.",
			};
		}

		const tenantId = await requireTenantId();
		const tdb = await getTenantDb(tenantId);
		const lowerEmail = email.toLowerCase();

		// Find and verify the invitation token (tenant-scoped).
		const verificationToken = await tdb
			.select()
			.from(verificationTokens)
			.where(
				and(
					eq(verificationTokens.token, token),
					eq(verificationTokens.identifier, lowerEmail),
				),
			)
			.limit(1);

		if (verificationToken.length === 0) {
			return {
				success: false,
				error: "Ungültiger oder abgelaufener Verifizierungstoken.",
			};
		}

		const tokenData = verificationToken[0];

		if (!tokenData?.expires || new Date() > tokenData.expires) {
			await tdb
				.delete(verificationTokens)
				.where(eq(verificationTokens.token, token));

			return {
				success: false,
				error:
					"Der Verifizierungslink ist abgelaufen. Bitte wenden Sie sich an einen Administrator.",
			};
		}

		// Find the user in control DB.
		const user = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.email, lowerEmail))
			.limit(1);

		const userData = user[0];
		if (!userData) {
			return { success: false, error: "Benutzer nicht gefunden." };
		}

		if (userData.emailVerified) {
			return {
				success: false,
				error: "Diese E-Mail-Adresse wurde bereits verifiziert.",
			};
		}

		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(password, saltRounds);

		// Mark user as verified.
		const updatedAt = new Date();
		await controlDb
			.update(controlUsers)
			.set({ emailVerified: true, updatedAt })
			.where(eq(controlUsers.id, userData.id));

		// Propagate the verification flag to all tenant mirrors.
		await mirrorUserToAllMemberTenants({
			id: userData.id,
			name: userData.name ?? null,
			email: userData.email,
			emailVerified: true,
			image: userData.image ?? null,
			createdAt: userData.createdAt,
			updatedAt,
		});

		// Create or update the credential account (control DB).
		const existingCredentialAccount = await controlDb
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, userData.id),
					eq(accounts.providerId, "credential"),
				),
			)
			.limit(1);

		if (existingCredentialAccount.length > 0) {
			await controlDb
				.update(accounts)
				.set({ password: hashedPassword, updatedAt: new Date() })
				.where(
					and(
						eq(accounts.userId, userData.id),
						eq(accounts.providerId, "credential"),
					),
				);
		} else {
			await controlDb.insert(accounts).values({
				accountId: lowerEmail,
				providerId: "credential",
				userId: userData.id,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		// Delete the invitation token (tenant DB).
		await tdb
			.delete(verificationTokens)
			.where(eq(verificationTokens.token, token));

		return { success: true };
	} catch (error) {
		console.error("Error verifying email and setting password:", error);
		return {
			success: false,
			error: "Ein unerwarteter Fehler ist aufgetreten.",
		};
	}
}

export async function requestPasswordReset(
	email: string,
): Promise<VerifyEmailResult> {
	try {
		const lowerEmail = email.toLowerCase();
		const user = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.email, lowerEmail))
			.limit(1);

		if (user.length === 0) {
			// Don't reveal that user doesn't exist
			return { success: true };
		}

		const userData = user[0];

		if (!userData?.emailVerified) {
			return {
				success: false,
				error: "Diese E-Mail-Adresse ist noch nicht verifiziert.",
			};
		}

		const token = crypto.randomBytes(32).toString("hex");
		const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

		await controlDb
			.delete(passwordResetTokens)
			.where(eq(passwordResetTokens.email, lowerEmail));

		await controlDb.insert(passwordResetTokens).values({
			email: lowerEmail,
			token,
			expires,
		});

		return { success: true };
	} catch (error) {
		console.error("Error requesting password reset:", error);
		return { success: false, error: "Ein Fehler ist aufgetreten." };
	}
}

export async function resetPassword(
	token: string,
	newPassword: string,
): Promise<VerifyEmailResult> {
	try {
		if (newPassword.length < 8) {
			return {
				success: false,
				error: "Das Passwort muss mindestens 8 Zeichen lang sein.",
			};
		}

		const hasUpperCase = /[A-Z]/.test(newPassword);
		const hasLowerCase = /[a-z]/.test(newPassword);
		const hasNumbers = /\d/.test(newPassword);

		if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
			return {
				success: false,
				error:
					"Das Passwort muss Groß- und Kleinbuchstaben sowie Zahlen enthalten.",
			};
		}

		const resetToken = await controlDb
			.select()
			.from(passwordResetTokens)
			.where(eq(passwordResetTokens.token, token))
			.limit(1);

		if (resetToken.length === 0) {
			return {
				success: false,
				error: "Ungültiger oder abgelaufener Reset-Token.",
			};
		}

		const tokenData = resetToken[0];

		if (!tokenData?.expires || new Date() > tokenData.expires) {
			await controlDb
				.delete(passwordResetTokens)
				.where(eq(passwordResetTokens.token, token));

			return { success: false, error: "Der Reset-Link ist abgelaufen." };
		}

		const user = await controlDb
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.email, tokenData.email))
			.limit(1);

		const userData = user[0];
		if (!userData) {
			return { success: false, error: "Benutzer nicht gefunden." };
		}

		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

		const existingCredentialAccount = await controlDb
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, userData.id),
					eq(accounts.providerId, "credential"),
				),
			)
			.limit(1);

		if (existingCredentialAccount.length > 0) {
			await controlDb
				.update(accounts)
				.set({ password: hashedPassword, updatedAt: new Date() })
				.where(
					and(
						eq(accounts.userId, userData.id),
						eq(accounts.providerId, "credential"),
					),
				);
		} else {
			await controlDb.insert(accounts).values({
				accountId: tokenData.email,
				providerId: "credential",
				userId: userData.id,
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		await controlDb
			.delete(passwordResetTokens)
			.where(eq(passwordResetTokens.token, token));

		return { success: true };
	} catch (error) {
		console.error("Error resetting password:", error);
		return {
			success: false,
			error: "Ein unerwarteter Fehler ist aufgetreten.",
		};
	}
}
