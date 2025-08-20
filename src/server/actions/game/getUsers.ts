"use server";

import { ne } from "drizzle-orm";
import { db } from "~/server/db";
import { users } from "~/server/db/schema";
import { auth } from "../../auth";

export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

// Get users excluding the current user
export async function getAllUsersExcept(): Promise<User[]> {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const excludeUserId = session.user.id;

  try {
    const allUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(ne(users.id, excludeUserId))
      .orderBy(users.name, users.email);

    return allUsers;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw new Error("Failed to fetch users");
  }
}
