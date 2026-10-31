// Every exported function in a "use server" module is a public POST
// endpoint. This test fails if one doesn't check its caller: it must call a
// guard (or delegate to a guarded action in the same module) before it reads
// or writes data, or be listed in PUBLIC_ACTIONS (test/server-actions.ts)
// with the reason it may be called by anyone. Who may call what is checked
// at runtime by authz-matrix.test.ts.

import { describe, expect, test } from "vitest";

import {
	PUBLIC_ACTIONS,
	type ServerAction,
	scanServerActions,
} from "./server-actions";

/** Calls that establish the caller (all go through the tenant-scoped auth()). */
const GUARDS = new Set([
	"auth",
	"requireCaller",
	"requireMember",
	"requireRole",
	"requireSelfOrRole",
	"requireSuperAdmin",
	// module-local guard helpers built on auth()
	"requireAuth",
	"requireRoles",
	"requireGetraenkewart",
	"requireFuchsenwart",
	// checks the caller before the body runs (src/server/lib/define-action.ts)
	"defineAction",
]);

/**
 * Calls that run a query. Getting a DB handle (`getCurrentTenantDb()`) is
 * fine before the guard, using it is not.
 */
const DATA_ACCESS = new Set([
	"select",
	"selectDistinct",
	"insert",
	"update",
	"delete",
	"transaction",
	"batch",
	"execute",
	"findFirst",
	"findMany",
]);

describe("server action authorization", () => {
	const { actions, unsupportedExports, inlineActions } = scanServerActions();
	const byKey = new Map(actions.map((a) => [a.key, a]));

	/** Index of the first call that establishes the caller, or -1. */
	function firstGuard(action: ServerAction, seen = new Set<string>()): number {
		seen.add(action.name);
		return action.callOrder.findIndex((call) => {
			if (GUARDS.has(call)) {
				return true;
			}
			// Delegating to another guarded action of the same module counts.
			const target = byKey.get(`${action.file}#${call}`);
			return (
				target !== undefined &&
				!seen.has(call) &&
				firstGuard(target, new Set(seen)) !== -1
			);
		});
	}

	const isPublic = (a: ServerAction) => a.key in PUBLIC_ACTIONS;

	test("the scan finds the server actions", () => {
		expect(actions.length).toBeGreaterThan(200);
	});

	test("every exported server action checks its caller", () => {
		const unguarded = actions.filter((a) => !isPublic(a) && firstGuard(a) < 0);
		expect(unguarded.map((a) => a.key)).toEqual([]);
	});

	test("the guard comes before the first query", () => {
		const late = actions.filter((a) => {
			if (isPublic(a)) {
				return false;
			}
			const data = a.callOrder.findIndex((call) => DATA_ACCESS.has(call));
			return data !== -1 && data < firstGuard(a);
		});
		expect(late.map((a) => a.key)).toEqual([]);
	});

	test("the public allowlist only names existing actions", () => {
		expect(Object.keys(PUBLIC_ACTIONS).filter((k) => !byKey.has(k))).toEqual(
			[],
		);
	});

	// The checks above only see `export async function` declarations and
	// `export const x = defineAction(…)`. Next would still expose
	// `export const x = async () => …`, re-exports or inline "use server"
	// functions as actions, so they are not allowed.
	test("server actions are exported functions or defineAction calls", () => {
		expect(unsupportedExports).toEqual([]);
		expect(inlineActions).toEqual([]);
	});
});
