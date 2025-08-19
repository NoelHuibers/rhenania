// middleware.ts

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";

// Extend NextRequest to include the auth property added by NextAuth.js
interface AuthenticatedRequest extends NextRequest {
  auth: {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  } | null;
}

// A simple list of the paths you want to remain public:
const PUBLIC_PATHS = [
  "/", // home
  "/about", // example public page
  "/contact", // contact page
  "/datenschutz", // privacy policy
  "/impressum", // imprint
  "/api/auth/(.*)", // all NextAuth endpoints
  "/auth/(.*)", // all auth endpoints
  "/party",
];

function isPublic(pathname: string) {
  const lowerPathname = pathname.toLowerCase();

  return PUBLIC_PATHS.some((p) => {
    const lowerP = p.toLowerCase();
    return lowerP.includes("(.*)")
      ? new RegExp(`^${lowerP.replace("(.*)", ".*")}`).test(lowerPathname)
      : lowerPathname === lowerP;
  });
}

// Role-protected paths configuration
const ROLE_PROTECTED_PATHS: Record<string, string[]> = {
  "/versorger": ["Admin", "Versorger"],
  "/inventur": ["Admin", "Versorger"],
  "/admin": ["Admin"],
};

// Helper to check if a path requires specific roles (case-insensitive)
function getRequiredRoles(pathname: string): string[] | null {
  const lowerPathname = pathname.toLowerCase();

  // Check exact matches first
  for (const [protectedPath, requiredRoles] of Object.entries(
    ROLE_PROTECTED_PATHS
  )) {
    if (lowerPathname === protectedPath.toLowerCase()) {
      return requiredRoles;
    }
  }

  // Check if pathname starts with any protected path (for nested routes)
  for (const [protectedPath, requiredRoles] of Object.entries(
    ROLE_PROTECTED_PATHS
  )) {
    if (lowerPathname.startsWith(protectedPath.toLowerCase() + "/")) {
      return requiredRoles;
    }
  }

  return null;
}

// Helper to check if user has required roles
async function userHasRequiredRoles(
  userId: string,
  requiredRoles: string[]
): Promise<boolean> {
  try {
    const userRolesList = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    const userRoleNames = userRolesList.map((r) => r.roleName);

    // Check if user has any of the required roles
    return requiredRoles.some((role) => userRoleNames.includes(role));
  } catch (error) {
    console.error("Error checking user roles:", error);
    return false;
  }
}

// Wrap every request in your Auth.js logic:
export default auth(async (req: AuthenticatedRequest) => {
  const { pathname, search } = req.nextUrl;

  // 1) ALWAYS redirect to lowercase if the pathname contains uppercase letters
  // This should be the first check to ensure consistent URLs
  if (pathname !== pathname.toLowerCase()) {
    const lowercaseUrl = req.nextUrl.clone();
    lowercaseUrl.pathname = pathname.toLowerCase();
    return NextResponse.redirect(lowercaseUrl, { status: 301 }); // 301 for permanent redirect
  }

  // 2) Allow any public URL
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // 3) If not signed in, redirect to /api/auth/signin with callbackUrl
  if (!req.auth?.user) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/auth/signin";
    // Add the current URL as callbackUrl parameter
    // This will preserve the original route for redirect after login
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  // 4) Check if the path requires specific roles
  const requiredRoles = getRequiredRoles(pathname);

  if (requiredRoles) {
    const userId = req.auth.user.id;
    const hasRequiredRole = await userHasRequiredRoles(userId, requiredRoles);

    if (!hasRequiredRole) {
      // Redirect to an access denied page or home page
      const accessDeniedUrl = req.nextUrl.clone();
      accessDeniedUrl.pathname = "/access-denied"; // You'll need to create this page
      accessDeniedUrl.searchParams.set("required", requiredRoles.join(","));
      accessDeniedUrl.searchParams.set("path", pathname);

      return NextResponse.redirect(accessDeniedUrl);
    }
  }

  // 5) User is authenticated and has required roles (if any), allow access
  return NextResponse.next();
});

// Never run middleware on _next internals, static files, or public assets:
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - All files with extensions (images, fonts, etc.)
     *
     * Note: We removed 'api/' from exclusions since we want to handle
     * /api/auth/* routes in the middleware for lowercase redirect
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
