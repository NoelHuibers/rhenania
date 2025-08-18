"use server";

import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userRoles, users, verificationTokens } from "~/server/db/schema";
import { sendVerificationEmail } from "./email"; // You'll need to implement this

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

  try {
    // Check if user already has this role
    const existingRole = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .limit(1);

    if (existingRole.length > 0) {
      // Remove role
      await db
        .delete(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
    } else {
      // Add role
      await db.insert(userRoles).values({
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
    emailVerified: Date | null;
  };
  error?: string;
}

export async function createUser(
  data: CreateUserData
): Promise<CreateUserResult> {
  await checkAdminPermission();

  try {
    // Check if user with this email already exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, data.email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      return {
        success: false,
        error: "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits.",
      };
    }

    // Create the user
    const newUser = {
      id: crypto.randomUUID(),
      email: data.email.toLowerCase(),
      name: data.name || null,
      image: null,
      emailVerified: null, // Will be set when they verify their email
    };

    await db.insert(users).values(newUser);

    // Generate verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    await db.insert(verificationTokens).values({
      identifier: data.email.toLowerCase(),
      token,
      expires,
    });

    // Send verification email (you'll need to implement this)
    try {
      await sendVerificationEmail(data.email, token);
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      // Don't fail the user creation if email fails
      // You might want to handle this differently
    }

    revalidatePath("/admin");

    return {
      success: true,
      user: newUser,
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

  try {
    // Check if user exists and is not verified
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

    if (user[0]?.emailVerified) {
      return {
        success: false,
        error: "E-Mail-Adresse ist bereits verifiziert.",
      };
    }

    // Delete existing verification tokens for this email
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.identifier, email.toLowerCase()));

    // Generate new verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

    await db.insert(verificationTokens).values({
      identifier: email.toLowerCase(),
      token,
      expires,
    });

    // Send verification email
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
