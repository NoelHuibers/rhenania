import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../db";
import { users } from "../db/schema";

export async function getUserName(): Promise<
  string | { success: false; error: string }
> {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return {
        success: false,
        error: "User must be authenticated to place an order",
      };
    }

    const userId = session.user.id;

    const user = await db
      .select({ username: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user[0]?.username || { success: false, error: "Unknown User" };
  } catch (error) {
    console.error("Error fetching user name:", error);
    return { success: false, error: "Unknown User" };
  }
}
