"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "~/server/db";
import { userPreferences, users } from "~/server/db/schema";
import { auth } from "../../auth";

export interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

const ELO_KEY = "gamification.eloEnabled";
const FALSE_JSON = JSON.stringify(false);

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
      .leftJoin(
        userPreferences,
        and(
          eq(userPreferences.userId, users.id),
          eq(userPreferences.key, ELO_KEY)
        )
      )
      .where(
        and(
          ne(users.id, excludeUserId),
          or(
            isNull(userPreferences.value),
            ne(userPreferences.value, FALSE_JSON)
          )
        )
      )
      .orderBy(users.name, users.email);

    return allUsers;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw new Error("Failed to fetch users");
  }
}
