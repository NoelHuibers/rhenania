"use server";

import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import {
	accounts,
	passwordResetTokens,
	users,
	verificationTokens,
} from "~/server/db/schema";

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

		// Find and verify the invitation token
		const verificationToken = await db
			.select()
			.from(verificationTokens)
			.where(
				and(
					eq(verificationTokens.token, token),
					eq(verificationTokens.identifier, email.toLowerCase()),
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
			await db
				.delete(verificationTokens)
				.where(eq(verificationTokens.token, token));

			return {
				success: false,
				error:
					"Der Verifizierungslink ist abgelaufen. Bitte wenden Sie sich an einen Administrator.",
			};
		}

		// Find the user
		const user = await db
			.select()
			.from(users)
			.where(eq(users.email, email.toLowerCase()))
			.limit(1);

		if (user.length === 0) {
			return { success: false, error: "Benutzer nicht gefunden." };
		}

		const userData = user[0];

		if (userData?.emailVerified) {
			return {
				success: false,
				error: "Diese E-Mail-Adresse wurde bereits verifiziert.",
			};
		}

		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(password, saltRounds);

		// Mark user as verified (boolean in Better Auth schema)
		await db
			.update(users)
			.set({ emailVerified: true, updatedAt: new Date() })
			.where(eq(users.id, userData?.id ?? ""));

		// Create or update the credential account with the password
		const existingCredentialAccount = await db
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, userData?.id ?? ""),
					eq(accounts.providerId, "credential"),
				),
			)
			.limit(1);

		if (existingCredentialAccount.length > 0) {
			await db
				.update(accounts)
				.set({ password: hashedPassword, updatedAt: new Date() })
				.where(
					and(
						eq(accounts.userId, userData?.id ?? ""),
						eq(accounts.providerId, "credential"),
					),
				);
		} else {
			await db.insert(accounts).values({
				accountId: email.toLowerCase(),
				providerId: "credential",
				userId: userData?.id ?? "",
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		// Delete the invitation token
		await db
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
		const user = await db
			.select()
			.from(users)
			.where(eq(users.email, email.toLowerCase()))
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

		await db
			.delete(passwordResetTokens)
			.where(eq(passwordResetTokens.email, email.toLowerCase()));

		await db.insert(passwordResetTokens).values({
			email: email.toLowerCase(),
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

		const resetToken = await db
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
			await db
				.delete(passwordResetTokens)
				.where(eq(passwordResetTokens.token, token));

			return { success: false, error: "Der Reset-Link ist abgelaufen." };
		}

		const user = await db
			.select()
			.from(users)
			.where(eq(users.email, tokenData?.email ?? ""))
			.limit(1);

		if (user.length === 0) {
			return { success: false, error: "Benutzer nicht gefunden." };
		}

		const saltRounds = 12;
		const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

		// Update the credential account password (create if it doesn't exist)
		const existingCredentialAccount = await db
			.select()
			.from(accounts)
			.where(
				and(
					eq(accounts.userId, user[0]?.id ?? ""),
					eq(accounts.providerId, "credential"),
				),
			)
			.limit(1);

		if (existingCredentialAccount.length > 0) {
			await db
				.update(accounts)
				.set({ password: hashedPassword, updatedAt: new Date() })
				.where(
					and(
						eq(accounts.userId, user[0]?.id ?? ""),
						eq(accounts.providerId, "credential"),
					),
				);
		} else {
			await db.insert(accounts).values({
				accountId: tokenData?.email ?? "",
				providerId: "credential",
				userId: user[0]?.id ?? "",
				password: hashedPassword,
				createdAt: new Date(),
				updatedAt: new Date(),
			});
		}

		await db
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
