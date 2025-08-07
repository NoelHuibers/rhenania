// middleware.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";

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
  "/trinken",
  "/versorger",
  "/rechnung",
];

// Helper to test literal vs pattern:
function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) =>
    p.includes("(.*)")
      ? new RegExp(`^${p.replace("(.*)", ".*")}$`).test(pathname)
      : pathname === p
  );
}

// Wrap every request in your Auth.js logic:
export default auth((req: AuthenticatedRequest) => {
  const { pathname } = req.nextUrl;

  // 1) Allow any public URL
  if (isPublic(pathname)) {
    return;
  }

  // 2) If not signed in, redirect to /api/auth/signin with callbackUrl
  if (!req.auth?.user) {
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = "/api/auth/signin";
    // Add the current URL as callbackUrl parameter
    // This will preserve the original route for redirect after login
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }
});

// Never run middleware on _next internals, static files, or public assets:
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - All files with extensions (images, fonts, etc.)
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
