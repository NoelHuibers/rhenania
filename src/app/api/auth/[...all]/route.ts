import { toNextJsHandler } from "better-auth/next-js";
import { betterAuthInstance } from "~/server/auth";

export const { GET, POST } = toNextJsHandler(betterAuthInstance);
