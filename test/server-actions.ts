// Inventory of every server action, read from the source with the
// TypeScript parser. Each exported function of a "use server" module is a
// public POST endpoint: `export async function` declarations and
// `export const x = defineAction(…)` (src/server/lib/define-action.ts).
// Used by `authz-guards.test.ts` (every action checks its caller),
// `authz-matrix.test.ts` (who may call what) and `tenant-isolation.test.ts`.

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
	 * but `export async function`, `export const x = defineAction(…)` and
	 * type exports). Next would still expose
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

/** The top-level `const name = …` initialiser of `sf`, if any. */
function constInitializer(sf: TS.SourceFile, name: string) {
	for (const st of sf.statements) {
		if (!ts.isVariableStatement(st)) {
			continue;
		}
		for (const decl of st.declarationList.declarations) {
			if (ts.isIdentifier(decl.name) && decl.name.text === name) {
				return decl.initializer;
			}
		}
	}
	return undefined;
}

const ZOD_KINDS: Record<string, string> = {
	string: "string",
	number: "number",
	boolean: "boolean",
	array: "unknown[]",
	object: "object",
};

/**
 * The parameter type a zod schema stands for, as far as the tests care:
 * "string", "number", "boolean", "unknown[]", "object" or "" (anything
 * else). Follows method chains (`z.string().min(1)`) and module constants.
 */
function zodTypeOf(expr: TS.Expression, sf: TS.SourceFile, hops = 0): string {
	if (ts.isIdentifier(expr)) {
		const init = hops < 5 ? constInitializer(sf, expr.text) : undefined;
		return init ? zodTypeOf(init, sf, hops + 1) : "";
	}
	if (
		!(
			ts.isCallExpression(expr) &&
			ts.isPropertyAccessExpression(expr.expression)
		)
	) {
		return "";
	}
	const target = expr.expression.expression;
	if (ts.isIdentifier(target) && target.text === "z") {
		return ZOD_KINDS[expr.expression.name.text] ?? "";
	}
	// A method of another schema: `.min(1)`, `.optional()`, …
	return zodTypeOf(target, sf, hops);
}

/**
 * `export const x = defineAction(options, handler)` declarations: the
 * wrapper checks the caller before the handler runs (see
 * src/server/lib/define-action.ts), so it counts as the first call. The
 * parameters are the names of the handler's destructured argument list,
 * typed after the `schema: z.tuple([...])` option. Null if any declaration
 * of the statement is something else.
 */
function definedActions(
	st: TS.VariableStatement,
	sf: TS.SourceFile,
): Omit<ServerAction, "file" | "key">[] | null {
	const found: Omit<ServerAction, "file" | "key">[] = [];
	for (const decl of st.declarationList.declarations) {
		const init = decl.initializer;
		const [options, handler] =
			init && ts.isCallExpression(init) ? init.arguments : [];
		if (
			!(
				init &&
				ts.isCallExpression(init) &&
				ts.isIdentifier(init.expression) &&
				init.expression.text === "defineAction" &&
				ts.isIdentifier(decl.name) &&
				options &&
				ts.isObjectLiteralExpression(options) &&
				handler &&
				(ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
			)
		) {
			return null;
		}
		const schema = options.properties.find(
			(p): p is TS.PropertyAssignment =>
				ts.isPropertyAssignment(p) && p.name.getText() === "schema",
		)?.initializer;
		const elements =
			schema &&
			ts.isCallExpression(schema) &&
			schema.arguments[0] &&
			ts.isArrayLiteralExpression(schema.arguments[0])
				? schema.arguments[0].elements
				: [];
		const first = handler.parameters[0]?.name;
		const names =
			schema && first && ts.isArrayBindingPattern(first)
				? first.elements.map((e) => e.getText().replace(/\s*=.*$/s, ""))
				: [];
		found.push({
			name: decl.name.text,
			callOrder: ["defineAction", ...callsIn(handler.body)],
			params: elements.map((element, i) => ({
				name: names[i] ?? `arg${i}`,
				type: zodTypeOf(element, sf),
			})),
		});
	}
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
		} else if (ts.isVariableStatement(st) && definedActions(st, sf)) {
			for (const action of definedActions(st, sf) ?? []) {
				inventory.actions.push({
					file,
					key: `${file}#${action.name}`,
					...action,
				});
			}
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
