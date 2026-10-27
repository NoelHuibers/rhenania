// Inventory of every server action, read from the source with the
// TypeScript parser. Each exported function of a "use server" module is a
// public POST endpoint. Used by `authz-guards.test.ts` (every action checks
// its caller) and `authz-matrix.test.ts` (who may call what).

import { globSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type * as TS from "typescript";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof TS;

/**
 * Actions anyone may call, without a session. Key: "<file>#<function>",
 * value: why that is fine.
 */
export const PUBLIC_ACTIONS: Record<string, string> = {
	"src/lib/formSubmit.ts#onSubmitAction": "public contact form",
	"src/server/actions/newuser/verifyEmail.ts#verifyEmailAndSetPassword":
		"invite link; authorised by the single-use token",
	"src/server/actions/bilder/images.ts#getActiveImageBySection":
		"images of the public website",
	"src/server/actions/bilder/images.ts#getAllActiveImagesBySection":
		"images of the public website",
	"src/server/actions/events/events.ts#getPublicUpcomingEvents":
		"public events on the website",
	"src/server/actions/events/events.ts#getPublicPastEvents":
		"public events on the website",
};

export type ServerAction = {
	/** Path relative to the repo root, e.g. `src/server/actions/drinks.ts`. */
	file: string;
	name: string;
	/** `"<file>#<name>"`, the key used by the allowlists and the matrix. */
	key: string;
	/** Names of everything the body calls, in evaluation order. */
	callOrder: string[];
	/** Parameter names (destructured ones as written) and type annotations. */
	params: { name: string; type: string }[];
};

export type ActionInventory = {
	actions: ServerAction[];
	/**
	 * Exports of a "use server" module that the scan cannot check (anything
	 * but `export async function` and type exports). Next would still expose
	 * them as actions, so they must not exist.
	 */
	unsupportedExports: string[];
	/** Function-level "use server" directives (inline actions). */
	inlineActions: string[];
};

function hasUseServer(statements: readonly TS.Statement[]) {
	for (const st of statements) {
		if (!(ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression))) {
			return false;
		}
		if (st.expression.text === "use server") {
			return true;
		}
	}
	return false;
}

function calleeName(call: TS.CallExpression): string | null {
	const callee = call.expression;
	if (ts.isIdentifier(callee)) {
		return callee.text;
	}
	if (ts.isPropertyAccessExpression(callee)) {
		return callee.name.text;
	}
	return null;
}

function callsIn(node: TS.Node): string[] {
	const names: string[] = [];
	const visit = (n: TS.Node) => {
		// Arguments are evaluated before the call itself.
		ts.forEachChild(n, visit);
		if (ts.isCallExpression(n)) {
			const name = calleeName(n);
			if (name) {
				names.push(name);
			}
		}
	};
	visit(node);
	return names;
}

function isExported(st: TS.Statement) {
	return (
		ts.canHaveModifiers(st) &&
		(ts.getModifiers(st) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		)
	);
}

function isTypeOnly(st: TS.Statement) {
	return (
		ts.isTypeAliasDeclaration(st) ||
		ts.isInterfaceDeclaration(st) ||
		(ts.isExportDeclaration(st) && st.isTypeOnly)
	);
}

function findInlineDirectives(sf: TS.SourceFile, file: string): string[] {
	const found: string[] = [];
	const visit = (n: TS.Node) => {
		if (
			(ts.isFunctionDeclaration(n) ||
				ts.isFunctionExpression(n) ||
				ts.isArrowFunction(n) ||
				ts.isMethodDeclaration(n)) &&
			n.body &&
			ts.isBlock(n.body) &&
			hasUseServer(n.body.statements)
		) {
			const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
			found.push(`${file}:${line + 1}`);
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
	return found;
}

/** Adds the exports of one "use server" module to `inventory`. */
function scanModule(
	sf: TS.SourceFile,
	file: string,
	inventory: ActionInventory,
) {
	const unsupported = (st: TS.Statement) =>
		inventory.unsupportedExports.push(`${file}: ${st.getText().slice(0, 60)}`);
	for (const st of sf.statements) {
		if (isTypeOnly(st)) {
			continue;
		}
		if (ts.isExportAssignment(st) || ts.isExportDeclaration(st)) {
			unsupported(st);
		} else if (!isExported(st)) {
			// not exported, not an endpoint
		} else if (ts.isFunctionDeclaration(st) && st.name && st.body) {
			inventory.actions.push({
				file,
				name: st.name.text,
				key: `${file}#${st.name.text}`,
				callOrder: callsIn(st.body),
				params: st.parameters.map((p) => ({
					name: p.name.getText(),
					type: p.type?.getText() ?? "",
				})),
			});
		} else {
			unsupported(st);
		}
	}
}

let cached: ActionInventory | null = null;

/** Scans `src/` for server actions (cached per test file). */
export function scanServerActions(): ActionInventory {
	if (cached) {
		return cached;
	}
	const inventory: ActionInventory = {
		actions: [],
		unsupportedExports: [],
		inlineActions: [],
	};
	const files = globSync("src/**/*.{ts,tsx}").filter(
		(f) => !/\.(test|spec)\.tsx?$/.test(f) && !f.endsWith(".d.ts"),
	);
	for (const file of files.sort()) {
		const text = readFileSync(file, "utf8");
		if (!text.includes("use server")) {
			continue;
		}
		const sf = ts.createSourceFile(
			file,
			text,
			ts.ScriptTarget.Latest,
			true,
			file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
		inventory.inlineActions.push(...findInlineDirectives(sf, file));
		if (hasUseServer(sf.statements)) {
			scanModule(sf, file, inventory);
		}
	}
	cached = inventory;
	return cached;
}
