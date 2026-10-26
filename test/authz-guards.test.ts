// Every exported function in a "use server" module is a public POST
// endpoint. This test fails if one doesn't check its caller: it must call a
// guard (or delegate to a guarded action in the same module), or be listed
// in PUBLIC_ACTIONS below with the reason it may be called by anyone.

import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

/** Calls that establish the caller (all go through the tenant-scoped auth()). */
const GUARDS = new Set([
	"auth",
	"requireMember",
	"requireRole",
	"requireSelfOrRole",
	"requireSuperAdmin",
	// module-local guard helpers built on auth()
	"requireAuth",
	"requireRoles",
	"requireGetraenkewart",
	"requireFuchsenwart",
]);

/** Deliberately callable without a session. Key: "<file>#<function>". */
const PUBLIC_ACTIONS: Record<string, string> = {
	"src/lib/formSubmit.ts#onSubmitAction": "public contact form",
	"src/server/actions/newuser/verifyEmail.ts#verifyEmailAndSetPassword":
		"invite link; authorised by the single-use token",
	"src/server/actions/bilder/homepageImages.ts#getActiveHomepageImages":
		"images of the public website",
	"src/server/actions/bilder/images.ts#getActiveImageBySection":
		"images of the public website",
	"src/server/actions/bilder/images.ts#getAllActiveImagesBySection":
		"images of the public website",
	"src/server/actions/events/events.ts#getPublicUpcomingEvents":
		"public events on the website",
	"src/server/actions/events/events.ts#getPublicPastEvents":
		"public events on the website",
	"src/server/actions/game/game.ts#calculateHypotheticalEloChange":
		"pure arithmetic, reads no data",
};

type Finding = { file: string; name: string };

function isUseServer(sf: import("typescript").SourceFile) {
	const first = sf.statements[0];
	return (
		first !== undefined &&
		ts.isExpressionStatement(first) &&
		ts.isStringLiteral(first.expression) &&
		first.expression.text === "use server"
	);
}

function calledNames(node: import("typescript").Node): Set<string> {
	const names = new Set<string>();
	const visit = (n: import("typescript").Node) => {
		if (ts.isCallExpression(n)) {
			const callee = n.expression;
			if (ts.isIdentifier(callee)) {
				names.add(callee.text);
			} else if (ts.isPropertyAccessExpression(callee)) {
				names.add(callee.name.text);
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(node);
	return names;
}

function scan(): { exports: Finding[]; unguarded: Finding[] } {
	const exports: Finding[] = [];
	const unguarded: Finding[] = [];
	for (const file of globSync("src/**/*.ts")) {
		if (file.endsWith(".test.ts")) {
			continue;
		}
		const text = readFileSync(file, "utf8");
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
		if (!isUseServer(sf)) {
			continue;
		}
		const fns = new Map<string, Set<string>>();
		for (const st of sf.statements) {
			const exported = ts
				.getModifiers?.(st as import("typescript").HasModifiers)
				?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
			if (exported && ts.isFunctionDeclaration(st) && st.name && st.body) {
				fns.set(st.name.text, calledNames(st.body));
			}
		}
		const guarded = (name: string, seen = new Set<string>()): boolean => {
			const calls = fns.get(name);
			if (!calls || seen.has(name)) {
				return false;
			}
			seen.add(name);
			for (const call of calls) {
				if (GUARDS.has(call)) {
					return true;
				}
				// Delegating to another guarded action of the same module counts.
				if (fns.has(call) && guarded(call, seen)) {
					return true;
				}
			}
			return false;
		};
		for (const name of fns.keys()) {
			exports.push({ file, name });
			if (!guarded(name) && !PUBLIC_ACTIONS[`${file}#${name}`]) {
				unguarded.push({ file, name });
			}
		}
	}
	return { exports, unguarded };
}

describe("server action authorization", () => {
	const { exports, unguarded } = scan();

	test("the scan finds the server actions", () => {
		expect(exports.length).toBeGreaterThan(200);
	});

	test("every exported server action checks its caller", () => {
		expect(unguarded.map((f) => `${f.file}#${f.name}`)).toEqual([]);
	});

	test("the public allowlist only names existing actions", () => {
		const known = new Set(exports.map((f) => `${f.file}#${f.name}`));
		expect(Object.keys(PUBLIC_ACTIONS).filter((k) => !known.has(k))).toEqual(
			[],
		);
	});
});
