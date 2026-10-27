// Route handlers (src/app/**/route.ts) are public endpoints like server
// actions, and the proxy lets every /api/* request through without a
// session. Each handler must say here who may call it; the ones open to
// members or superadmins are called by everybody else and must refuse.

import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { handleUpload } from "@vercel/blob/client";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	signOut,
	switchTenant,
	type TestTenant,
	type TestUser,
} from "./harness";
import { countQueries } from "./query-count";
import { testState } from "./state";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));

type Access =
	| { public: string }
	| { token: string }
	| { library: string }
	| "member"
	| "superadmin";

const ROUTES: Record<string, Record<string, Access>> = {
	// One handler per method, delegating to the host's own Better Auth
	// instance; hosts without a Corps get a 404.
	"src/app/api/auth/[...all]/route.ts": {
		DELETE: { library: "Better Auth: sign-in, sessions, password reset" },
		GET: { library: "Better Auth: sign-in, sessions, password reset" },
		PATCH: { library: "Better Auth: sign-in, sessions, password reset" },
		POST: { library: "Better Auth: sign-in, sessions, password reset" },
		PUT: { library: "Better Auth: sign-in, sessions, password reset" },
	},
	"src/app/api/calendar/route.ts": {
		GET: { public: "public events of the Corps as iCal" },
	},
	"src/app/api/calendar/[token]/route.ts": {
		// Tokens of another Corps are a 404: see calendar/[token]/route.test.ts.
		GET: { token: "a member's personal feed, keyed by a secret token" },
	},
	"src/app/api/health/route.ts": {
		GET: { public: "liveness and expected schema versions, no data" },
	},
	"src/app/api/health/tenants/route.ts": { GET: "superadmin" },
	"src/app/api/sempro/pdf/route.ts": { GET: "member" },
	"src/app/api/upload/route.ts": { POST: "member" },
};

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);

/** Names a top-level statement exports (incl. `export const { GET } = …`). */
function exportedNames(st: import("typescript").Statement): string[] {
	// `export { handler as GET, handler as POST }`
	if (
		ts.isExportDeclaration(st) &&
		!st.isTypeOnly &&
		st.exportClause &&
		ts.isNamedExports(st.exportClause)
	) {
		return st.exportClause.elements.map((el) => el.name.text);
	}
	const exported =
		ts.canHaveModifiers(st) &&
		(ts.getModifiers(st) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		);
	if (!exported) {
		return [];
	}
	if (ts.isFunctionDeclaration(st)) {
		return st.name ? [st.name.text] : [];
	}
	if (!ts.isVariableStatement(st)) {
		return [];
	}
	return st.declarationList.declarations.flatMap((decl) =>
		ts.isObjectBindingPattern(decl.name)
			? decl.name.elements.map((el) => el.name.getText())
			: [decl.name.getText()],
	);
}

/** `file#METHOD` for every exported request handler. */
function scanRoutes(): string[] {
	return globSync("src/app/**/route.{ts,tsx}")
		.sort()
		.flatMap((file) => {
			const sf = ts.createSourceFile(
				file,
				readFileSync(file, "utf8"),
				ts.ScriptTarget.Latest,
				true,
			);
			return sf.statements
				.flatMap(exportedNames)
				.filter((name) => METHODS.has(name))
				.map((name) => `${file}#${name}`);
		});
}

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	// Like the real SDK: run the route's check for the requested path first.
	vi.mocked(handleUpload).mockImplementation(async (opts) => {
		const body = opts.body as { payload: { pathname: string } };
		const options = await opts.onBeforeGenerateToken(
			body.payload.pathname,
			null,
			false,
		);
		return { type: "blob.generate-client-token", clientToken: "t", options };
	});
});

type Caller = {
	name: string;
	setUp: (home: TestTenant, other: TestTenant) => Promise<TestUser | null>;
	noTenantHost?: boolean;
};

const EVERY_ROLE = ["Admin", "Getränkewart", "Fotowart", "Fuchs", "CC-Kasse"];

/** Callers that are not active members of the request's Corps. */
const OUTSIDERS: Caller[] = [
	{ name: "anonymous", setUp: async () => null },
	{
		name: "signed in, member of no Corps",
		setUp: () => createUser({ tenantId: null }),
	},
	{
		name: "Admin of another Corps",
		setUp: (_home, other) =>
			createUser({ roles: EVERY_ROLE, tenantId: other.id }),
	},
	{
		name: "suspended Admin",
		setUp: (home) =>
			createUser({
				roles: EVERY_ROLE,
				tenantId: home.id,
				membership: "suspended",
			}),
	},
	{
		name: "Admin, on a host without a Corps",
		noTenantHost: true,
		setUp: (home) => createUser({ roles: EVERY_ROLE, tenantId: home.id }),
	},
];

/** Members of the Corps, up to Admin, who are not superadmins. */
const MEMBERS: Caller[] = [
	{ name: "member", setUp: (home) => createUser({ tenantId: home.id }) },
	{
		name: "Admin",
		setUp: (home) => createUser({ roles: EVERY_ROLE, tenantId: home.id }),
	},
];

/**
 * A request per guarded route, and the status a plain member gets for it
 * (the Semesterprogramm isn't configured in these tests, hence 400).
 */
const REQUESTS: Record<
	string,
	{ build: (slug: string) => Request; memberStatus?: number }
> = {
	"src/app/api/sempro/pdf/route.ts#GET": {
		build: (slug) =>
			new Request(`http://${slug}.test.localhost/api/sempro/pdf`),
		memberStatus: 400,
	},
	"src/app/api/upload/route.ts#POST": {
		// Receipts are open to every member (no role, no own folder).
		build: (slug) =>
			new Request(`http://${slug}.test.localhost/api/upload`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					type: "blob.generate-client-token",
					payload: {
						pathname: `tenants/${slug}/receipts/beleg.pdf`,
						callbackUrl: "",
						clientPayload: null,
						multipart: false,
					},
				}),
			}),
		memberStatus: 200,
	},
	"src/app/api/health/tenants/route.ts#GET": {
		build: (slug) =>
			new Request(`http://${slug}.test.localhost/api/health/tenants`),
	},
};

const GUARD_TABLES =
	/\b(from|join)\s+"(role|user_role|control_tenant|control_tenant_domain|control_tenant_feature|control_tenant_auth_config|control_tenant_membership|control_super_admin)"/i;

describe("route handler authorization", () => {
	const routes = scanRoutes();

	test("every route handler is listed, and nothing else", () => {
		const listed = Object.entries(ROUTES).flatMap(([file, methods]) =>
			Object.keys(methods).map((m) => `${file}#${m}`),
		);
		expect(routes.filter((r) => !listed.includes(r))).toEqual([]);
		expect(listed.filter((r) => !routes.includes(r))).toEqual([]);
	});

	const guarded = routes.filter((key) => {
		const [file, method] = key.split("#") as [string, string];
		const access = ROUTES[file]?.[method];
		return access === "member" || access === "superadmin";
	});

	test("every member or superadmin route has a request to test it with", () => {
		expect(guarded.filter((key) => !REQUESTS[key])).toEqual([]);
	});

	test.each(guarded)("%s refuses everybody else", async (key) => {
		const [file, method] = key.split("#") as [string, string];
		const access = ROUTES[file]?.[method];
		const callers =
			access === "superadmin" ? [...OUTSIDERS, ...MEMBERS] : OUTSIDERS;
		const handler = (
			(await import(`../${file}`)) as Record<
				string,
				(req: Request) => Promise<Response>
			>
		)[method] as (req: Request) => Promise<Response>;
		const { build } = REQUESTS[key] as NonNullable<(typeof REQUESTS)[string]>;

		const home = await createTenant();
		const other = await createTenant();
		const problems: string[] = [];
		for (const caller of callers) {
			const user = await caller.setUp(home, other);
			if (user) {
				signInAs(user);
			} else {
				signOut();
			}
			if (caller.noTenantHost) {
				testState.tenantId = null;
				testState.headers = { host: "no-corps.example" };
			} else {
				switchTenant(home);
				testState.headers = {};
			}
			const {
				result: res,
				log,
				writes,
			} = await countQueries(() => handler(build(home.slug)));
			const reads = log
				.flatMap((e) => e.sql)
				.filter((sql) => /^\s*select/i.test(sql) && !GUARD_TABLES.test(sql));
			if (res.status < 400) {
				problems.push(`${caller.name}: status ${res.status}`);
			}
			if (writes > 0 || reads.length > 0) {
				problems.push(`${caller.name}: touched data`);
			}
		}
		expect(problems).toEqual([]);
	});

	test("members get through to the member routes", async () => {
		const home = await createTenant();
		signInAs(await createUser({ tenantId: home.id }));
		for (const key of guarded) {
			const { build, memberStatus } = REQUESTS[key] as NonNullable<
				(typeof REQUESTS)[string]
			>;
			if (memberStatus === undefined) {
				continue;
			}
			const [file, method] = key.split("#") as [string, string];
			const mod = (await import(`../${file}`)) as Record<
				string,
				(req: Request) => Promise<Response>
			>;
			const handler = mod[method] as (r: Request) => Promise<Response>;
			expect((await handler(build(home.slug))).status, key).toBe(memberStatus);
		}
	});
});
