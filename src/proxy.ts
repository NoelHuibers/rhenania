// middleware.ts

import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { betterAuthInstance } from "~/server/auth";
import { roles, userRoles } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import {
	resolveTenantByHost,
	TENANT_HEADER,
} from "~/server/lib/tenant-context";

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
	"/api/calendar(.*)",
];

// All known valid paths (including protected ones). Wildcards use (.*).
const VALID_PATHS = [
	"/",
	"/about",
	"/contact",
	"/datenschutz",
	"/impressum",
	"/party",
	"/api/(.*)",
	"/auth/(.*)",
	"/access-denied",
	"/profile",
	"/bestellungen",
	"/bilder",
	"/eloranking",
	"/rechnungen",
	"/trinken",
	"/leaderboard",
	"/admin",
	"/admin/(.*)",
	"/inventur",
	"/getraenkewart",
	"/semesterprogramm",
	"/konten",
];

function isValidPath(pathname: string) {
	const lower = pathname.toLowerCase();
	return VALID_PATHS.some((p) => {
		const lowerP = p.toLowerCase();
		return lowerP.includes("(.*)")
			? new RegExp(`^${lowerP.replace("(.*)", ".*")}`).test(lower)
			: lower === lowerP;
	});
}

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
	"/getraenkewart": ["Admin", "Getränkewart"],
	"/inventur": ["Admin", "Getränkewart"],
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
	tenantId: string,
): Promise<boolean> {
	try {
		const tdb = await getTenantDb(tenantId);
		const userRolesList = await tdb
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

function withTenantHeader(
	response: NextResponse,
	request: NextRequest,
	tenantId: string,
): NextResponse {
	// Stamp on both: response so framework caches see it, request headers so
	// downstream RSCs read it via next/headers in the same render pass.
	response.headers.set(TENANT_HEADER, tenantId);
	request.headers.set(TENANT_HEADER, tenantId);
	return response;
}

export default async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// 0) Resolve tenant by host. Unknown host => render the not-found page.
	//    Known host => stamp x-tenant-id header for downstream code.
	const host = request.headers.get("host");
	const tenantId = await resolveTenantByHost(host);
	if (!tenantId) {
		const notFoundUrl = request.nextUrl.clone();
		notFoundUrl.pathname = "/tenant-not-found";
		notFoundUrl.search = "";
		return NextResponse.rewrite(notFoundUrl);
	}
	request.headers.set(TENANT_HEADER, tenantId);

	// 1) Redirect to lowercase (skip case-sensitive API paths like calendar tokens)
	const isCaseSensitiveApi = pathname
		.toLowerCase()
		.startsWith("/api/calendar/");
	if (!isCaseSensitiveApi && pathname !== pathname.toLowerCase()) {
		const lowercaseUrl = request.nextUrl.clone();
		lowercaseUrl.pathname = pathname.toLowerCase();
		return withTenantHeader(
			NextResponse.redirect(lowercaseUrl, { status: 301 }),
			request,
			tenantId,
		);
	}

	// 2) Redirect unknown paths instead of 404
	if (!isValidPath(pathname)) {
		const session = await betterAuthInstance.api.getSession({
			headers: request.headers,
		});
		const fallbackUrl = request.nextUrl.clone();
		fallbackUrl.pathname = session?.user ? "/profile" : "/";
		fallbackUrl.search = "";
		return withTenantHeader(
			NextResponse.redirect(fallbackUrl, { status: 302 }),
			request,
			tenantId,
		);
	}

	// 3) Allow public URLs
	if (isPublic(pathname)) {
		return withTenantHeader(
			NextResponse.next({ request: { headers: request.headers } }),
			request,
			tenantId,
		);
	}

	// 4) Check session via Better Auth
	const session = await betterAuthInstance.api.getSession({
		headers: request.headers,
	});

	if (!session?.user) {
		const signInUrl = request.nextUrl.clone();
		signInUrl.pathname = "/auth/signin";
		signInUrl.searchParams.set("callbackUrl", request.nextUrl.href);
		return withTenantHeader(
			NextResponse.redirect(signInUrl),
			request,
			tenantId,
		);
	}

	// 5) Check role-protected paths
	const requiredRoles = getRequiredRoles(pathname);

	if (requiredRoles) {
		const hasRequiredRole = await userHasRequiredRoles(
			session.user.id,
			requiredRoles,
			tenantId,
		);

		if (!hasRequiredRole) {
			const accessDeniedUrl = request.nextUrl.clone();
			accessDeniedUrl.pathname = "/access-denied";
			accessDeniedUrl.searchParams.set("required", requiredRoles.join(","));
			accessDeniedUrl.searchParams.set("path", pathname);
			return withTenantHeader(
				NextResponse.redirect(accessDeniedUrl),
				request,
				tenantId,
			);
		}
	}

	return withTenantHeader(
		NextResponse.next({ request: { headers: request.headers } }),
		request,
		tenantId,
	);
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
