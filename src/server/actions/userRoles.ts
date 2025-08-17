// ~/server/actions/userRoles.ts
"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { roles, userRoles, users } from "~/server/db/schema";

export interface UserRole {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Get all roles for a specific user
 */
export async function getUserRoles(userId: string): Promise<UserRole[]> {
  try {
    const userRoleData = await db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return userRoleData;
  } catch (error) {
    console.error("Error fetching user roles:", error);
    throw new Error("Failed to fetch user roles");
  }
}

/**
 * Check if a user has a specific role
 */
export async function hasRole(
  userId: string,
  roleName: string
): Promise<boolean> {
  try {
    const result = await db
      .select({ count: sql`1` })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), eq(roles.name, roleName)))
      .limit(1);

    return result.length > 0;
  } catch (error) {
    console.error("Error checking user role:", error);
    return false;
  }
}

/**
 * Check if a user has any of the specified roles
 */
export async function hasAnyRole(
  userId: string,
  roleNames: string[]
): Promise<boolean> {
  try {
    const userRoleData = await getUserRoles(userId);
    const userRoleNames = userRoleData.map((role) => role.name);

    return roleNames.some((roleName) => userRoleNames.includes(roleName));
  } catch (error) {
    console.error("Error checking user roles:", error);
    return false;
  }
}

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  assignedBy?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Check if user exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user.length === 0) {
      return { success: false, message: "User not found" };
    }

    // Check if role exists
    const role = await db
      .select()
      .from(roles)
      .where(eq(roles.id, roleId))
      .limit(1);
    if (role.length === 0) {
      return { success: false, message: "Role not found" };
    }

    // Check if user already has this role
    const existingAssignment = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
      .limit(1);

    if (existingAssignment.length > 0) {
      return { success: false, message: "User already has this role" };
    }

    // Assign the role
    await db.insert(userRoles).values({
      userId,
      roleId,
      assignedBy,
    });

    return { success: true, message: "Role assigned successfully" };
  } catch (error) {
    console.error("Error assigning role to user:", error);
    return { success: false, message: "Failed to assign role" };
  }
}

/**
 * Remove a role from a user
 */
export async function removeRoleFromUser(
  userId: string,
  roleId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

    return { success: true, message: "Role removed successfully" };
  } catch (error) {
    console.error("Error removing role from user:", error);
    return { success: false, message: "Failed to remove role" };
  }
}

/**
 * Get all available roles
 */
export async function getAllRoles(): Promise<UserRole[]> {
  try {
    const allRoles = await db
      .select({
        id: roles.id,
        name: roles.name,
        description: roles.description,
      })
      .from(roles);

    return allRoles;
  } catch (error) {
    console.error("Error fetching all roles:", error);
    throw new Error("Failed to fetch roles");
  }
}

/**
 * Create a new role
 */
export async function createRole(
  name: string,
  description?: string
): Promise<{ success: boolean; message: string; roleId?: string }> {
  try {
    // Check if role with this name already exists
    const existingRole = await db
      .select()
      .from(roles)
      .where(eq(roles.name, name))
      .limit(1);

    if (existingRole.length > 0) {
      return { success: false, message: "Role with this name already exists" };
    }

    const [newRole] = await db
      .insert(roles)
      .values({
        name,
        description,
      })
      .returning({ id: roles.id });

    if (!newRole) {
      return { success: false, message: "Failed to create role" };
    }

    return {
      success: true,
      message: "Role created successfully",
      roleId: newRole.id,
    };
  } catch (error) {
    console.error("Error creating role:", error);
    return { success: false, message: "Failed to create role" };
  }
}
