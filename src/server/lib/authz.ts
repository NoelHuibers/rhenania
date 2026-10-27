// authz.ts — authorization guards for server actions.
//
// Every exported function in a "use server" module is a public POST
// endpoint, so each one must check its caller itself — middleware path rules
// and hidden buttons don't protect actions. `auth()` is tenant-scoped (null
// unless the caller is an active member of the request's tenant), so these
// guards check membership and roles in one go.

import { auth } from "~/server/auth";

export class AuthzError extends Error {
	constructor(readonly code: "UNAUTHENTICATED" | "FORBIDDEN") {
		super(
			code === "UNAUTHENTICATED" ? "Nicht angemeldet" : "Keine Berechtigung",
		);
		this.name = "AuthzError";
	}
}

/** Role sets, aligned with the page rules in src/proxy.ts and the sidebar. */
export const ROLES = {
	admin: ["Admin"],
	getraenke: ["Getränkewart", "Admin"],
	fuchsen: ["Fuchs", "Admin"],
	fotos: ["Fotowart", "Admin"],
	events: ["Admin"],
	konten: ["Admin", "Getränkewart", "CC-Kasse", "Aktivenkasse"],
} as const satisfies Record<string, readonly string[]>;

export type Member = NonNullable<Awaited<ReturnType<typeof auth>>>["user"];

/** The caller, if they are an active member of the current tenant; throws otherwise. */
export async function requireMember(): Promise<Member> {
	const session = await auth();
	if (!session) {
		throw new AuthzError("UNAUTHENTICATED");
	}
	return session.user;
}

/** The caller, if they hold at least one of `roles` in the current tenant. */
export async function requireRole(roles: readonly string[]): Promise<Member> {
	const member = await requireMember();
	if (!roles.some((role) => member.roles.includes(role))) {
		throw new AuthzError("FORBIDDEN");
	}
	return member;
}

/** The caller, if they are `userId` themselves or hold one of `roles`. */
export async function requireSelfOrRole(
	userId: string,
	roles: readonly string[],
): Promise<Member> {
	const member = await requireMember();
	if (
		member.id !== userId &&
		!roles.some((role) => member.roles.includes(role))
	) {
		throw new AuthzError("FORBIDDEN");
	}
	return member;
}
