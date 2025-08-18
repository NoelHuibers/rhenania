"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "~/server/db";
import {
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
  password: string
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

    // Find and verify the token
    const verificationToken = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.token, token),
          eq(verificationTokens.identifier, email.toLowerCase())
        )
      )
      .limit(1);

    if (verificationToken.length === 0) {
      return {
        success: false,
        error: "Ungültiger oder abgelaufener Verifizierungstoken.",
      };
    }

    const tokenData = verificationToken[0];

    // Check if token is expired
    if (new Date() > tokenData!.expires) {
      // Clean up expired token
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
      return {
        success: false,
        error: "Benutzer nicht gefunden.",
      };
    }

    const userData = user[0];

    // Check if user is already verified
    if (userData!.emailVerified) {
      return {
        success: false,
        error: "Diese E-Mail-Adresse wurde bereits verifiziert.",
      };
    }

    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Update user with verified email and password
    await db
      .update(users)
      .set({
        emailVerified: new Date(),
        password: hashedPassword,
      })
      .where(eq(users.id, userData!.id));

    // Delete the verification token
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
  email: string
): Promise<VerifyEmailResult> {
  try {
    // Check if user exists and is verified
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (user.length === 0) {
      // Don't reveal that user doesn't exist for security
      return { success: true };
    }

    const userData = user[0];

    if (!userData!.emailVerified) {
      return {
        success: false,
        error: "Diese E-Mail-Adresse ist noch nicht verifiziert.",
      };
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Delete any existing reset tokens for this email
    await db
      .delete(passwordResetTokens)
      .where(eq(passwordResetTokens.email, email.toLowerCase()));

    // Create new reset token
    await db.insert(passwordResetTokens).values({
      email: email.toLowerCase(),
      token,
      expires,
    });

    // Send password reset email (import from your email service)
    // await sendPasswordResetEmail(email, token);

    return { success: true };
  } catch (error) {
    console.error("Error requesting password reset:", error);
    return {
      success: false,
      error: "Ein Fehler ist aufgetreten.",
    };
  }
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<VerifyEmailResult> {
  try {
    // Validate password requirements
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

    // Find and verify the reset token
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

    // Check if token is expired
    if (new Date() > tokenData!.expires) {
      // Clean up expired token
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token));

      return {
        success: false,
        error: "Der Reset-Link ist abgelaufen.",
      };
    }

    // Find the user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, tokenData!.email))
      .limit(1);

    if (user.length === 0) {
      return {
        success: false,
        error: "Benutzer nicht gefunden.",
      };
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, user[0]!.id));

    // Delete the reset token
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
