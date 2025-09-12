"use server";

import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles, users } from "~/server/db/schema";

export interface UserRoleResult {
  success: boolean;
  role?: {
    id: string;
    name: string;
  };
  error?: string;
}

export async function getUserRole(userId: string): Promise<UserRoleResult> {
  try {
    if (!userId) {
      return {
        success: false,
        error: "User ID is required",
      };
    }

    // Query to get user's role information
    const userWithRole = await db
      .select({
        roleId: roles.id,
        roleName: roles.name,
      })
      .from(userRoles)
      .innerJoin(users, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId))
      .limit(1);

    if (!userWithRole.length) {
      return {
        success: false,
        error: "No role found for this user",
      };
    }

    const roleData = userWithRole[0]!;
    const role = {
      id: roleData.roleId,
      name: roleData.roleName,
    };

    return {
      success: true,
      role,
    };
  } catch (error) {
    console.error("Error fetching user role:", error);
    return {
      success: false,
      error: "Failed to fetch user role. Please try again.",
    };
  }
}

// Helper function to get current user's role
export async function getCurrentUserRole(): Promise<UserRoleResult> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return {
        success: false,
        error: "User must be authenticated",
      };
    }

    return await getUserRole(session.user.id);
  } catch (error) {
    console.error("Error fetching current user role:", error);
    return {
      success: false,
      error: "Failed to fetch current user role. Please try again.",
    };
  }
}
