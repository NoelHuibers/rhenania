// middleware.ts

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { betterAuthInstance } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";

// A simple list of the paths you want to remain public:
const PUBLIC_PATHS = [
	"/", // home
	"/about", // example public page
	"/contact", // contact page
	"/datenschutz", // privacy policy
	"/impressum", // imprint
	"/api/auth/(.*)", // all Better Auth endpoints
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
	"/orders": ["Admin", "Versorger"],
	"/bilder": ["Admin", "Fotowart"],
	"/admin": ["Admin"],
};

function getRequiredRoles(pathname: string): string[] | null {
	const lowerPathname = pathname.toLowerCase();

	for (const [protectedPath, requiredRoles] of Object.entries(
		ROLE_PROTECTED_PATHS,
	)) {
		if (lowerPathname === protectedPath.toLowerCase()) {
			return requiredRoles;
		}
	}

	for (const [protectedPath, requiredRoles] of Object.entries(
		ROLE_PROTECTED_PATHS,
	)) {
		if (lowerPathname.startsWith(`${protectedPath.toLowerCase()}/`)) {
			return requiredRoles;
		}
	}

	return null;
}

async function userHasRequiredRoles(
	userId: string,
	requiredRoles: string[],
): Promise<boolean> {
	try {
		const userRolesList = await db
			.select({ roleName: roles.name })
			.from(userRoles)
			.innerJoin(roles, eq(userRoles.roleId, roles.id))
			.where(eq(userRoles.userId, userId));

		const userRoleNames = userRolesList.map((r) => r.roleName);
		return requiredRoles.some((role) => userRoleNames.includes(role));
	} catch (error) {
		console.error("Error checking user roles:", error);
		return false;
	}
}

export default async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// 1) Redirect to lowercase
	if (pathname !== pathname.toLowerCase()) {
		const lowercaseUrl = request.nextUrl.clone();
		lowercaseUrl.pathname = pathname.toLowerCase();
		return NextResponse.redirect(lowercaseUrl, { status: 301 });
	}

	// 2) Allow public URLs
	if (isPublic(pathname)) {
		return NextResponse.next();
	}

	// 3) Check session via Better Auth
	const session = await betterAuthInstance.api.getSession({
		headers: request.headers,
	});

	if (!session?.user) {
		const signInUrl = request.nextUrl.clone();
		signInUrl.pathname = "/auth/signin";
		signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
		return NextResponse.redirect(signInUrl);
	}

	// 4) Check role-protected paths
	const requiredRoles = getRequiredRoles(pathname);

	if (requiredRoles) {
		const hasRequiredRole = await userHasRequiredRoles(
			session.user.id,
			requiredRoles,
		);

		if (!hasRequiredRole) {
			const accessDeniedUrl = request.nextUrl.clone();
			accessDeniedUrl.pathname = "/access-denied";
			accessDeniedUrl.searchParams.set("required", requiredRoles.join(","));
			accessDeniedUrl.searchParams.set("path", pathname);
			return NextResponse.redirect(accessDeniedUrl);
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
