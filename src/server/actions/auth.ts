// ~/server/actions/auth.ts
"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { accounts, users } from "~/server/db/schema";

type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};

export async function getConnectedAccountsAction(): Promise<
  ActionResult<{
    accounts: Array<{ provider: string; type: string }>;
    hasPassword: boolean;
  }>
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Get user's connected accounts
    const userAccounts = await db
      .select({
        provider: accounts.provider,
        type: accounts.type,
      })
      .from(accounts)
      .where(eq(accounts.userId, session.user.id));

    // Check if user has a password set
    const user = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const hasPassword = !!user[0]?.password;

    return {
      success: true,
      data: {
        accounts: userAccounts,
        hasPassword,
      },
    };
  } catch (error) {
    console.error("Error fetching connected accounts:", error);
    return { success: false, error: "Failed to fetch connected accounts" };
  }
}

export async function disconnectProviderAction(
  provider: string
): Promise<ActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (!provider) {
      return { success: false, error: "Provider is required" };
    }

    // Check if user has other login methods before allowing disconnect
    const userAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, session.user.id));

    const user = await db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    const hasPassword = !!user[0]?.password;
    const providerName =
      provider === "microsoft" ? "microsoft-entra-id" : provider;

    // Don't allow disconnect if it's the only login method
    if (!hasPassword && userAccounts.length <= 1) {
      return {
        success: false,
        error:
          "Cannot disconnect your only login method. Set up a password first.",
      };
    }

    // Disconnect the provider
    const deleteResult = await db
      .delete(accounts)
      .where(
        and(
          eq(accounts.userId, session.user.id),
          eq(accounts.provider, providerName)
        )
      );

    // Revalidate the current page to reflect changes
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("Error disconnecting provider:", error);
    return { success: false, error: "Failed to disconnect provider" };
  }
}

export async function changePasswordAction({
  currentPassword,
  newPassword,
}: {
  currentPassword?: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    if (!newPassword || newPassword.length < 8) {
      return {
        success: false,
        error: "New password must be at least 8 characters long",
      };
    }

    // Get current user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user[0]) {
      return { success: false, error: "User not found" };
    }

    // If user has a current password, verify it
    if (user[0].password && currentPassword) {
      const isValidPassword = await bcrypt.compare(
        currentPassword,
        user[0].password
      );
      if (!isValidPassword) {
        return { success: false, error: "Current password is incorrect" };
      }
    } else if (user[0].password && !currentPassword) {
      return { success: false, error: "Current password is required" };
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update the password
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, session.user.id));

    // Revalidate the current page to reflect changes
    revalidatePath("/", "layout");

    return { success: true };
  } catch (error) {
    console.error("Error changing password:", error);
    return { success: false, error: "Failed to change password" };
  }
}

// Optional: Action to connect a new provider (if you want to handle this server-side)
export async function connectProviderAction(
  provider: string
): Promise<ActionResult<{ redirectUrl: string }>> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Generate the appropriate OAuth redirect URL
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const callbackUrl = encodeURIComponent(`${baseUrl}/account/security`);

    let redirectUrl: string;

    switch (provider.toLowerCase()) {
      case "microsoft":
        redirectUrl = `/api/auth/signin/microsoft-entra-id?callbackUrl=${callbackUrl}`;
        break;
      default:
        return { success: false, error: "Unsupported provider" };
    }

    return {
      success: true,
      data: { redirectUrl },
    };
  } catch (error) {
    console.error("Error connecting provider:", error);
    return { success: false, error: "Failed to connect provider" };
  }
}
