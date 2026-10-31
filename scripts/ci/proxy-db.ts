// scripts/ci/proxy-db.ts — pure helpers for the proxy-db import ratchet.
//
// The implicit `db`/`client` exported by `src/server/db/index.ts` picks its
// tenant from the request headers on every query (#33). New code takes an
// explicit `TenantDb` instead; this counts the files that still import the
// proxy so CI can show the number going down and stop it from going up.

import path from "node:path";
import ts from "typescript";

/** The proxy module, as a repo-relative path without extension. */
const PROXY_MODULE = "src/server/db";

/** Resolves an import specifier to a repo-relative module path, or null. */
function resolveSpecifier(file: string, specifier: string): string | null {
	let resolved: string;
	if (specifier.startsWith("~/")) {
		resolved = `src/${specifier.slice(2)}`;
	} else if (specifier.startsWith(".")) {
		resolved = path.posix.join(path.posix.dirname(file), specifier);
	} else {
		return null;
	}
	return resolved.replace(/\.(ts|tsx|js)$/, "").replace(/\/index$/, "");
}

/** Parse syntax so comments, strings and type imports cannot affect the count. */
export function importsProxyDb(file: string, source: string): boolean {
	if (file === "src/server/db/index.ts") {
		return false;
	}
	const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	let found = false;
	const isProxy = (node: ts.Node | undefined) =>
		node !== undefined &&
		ts.isStringLiteral(node) &&
		resolveSpecifier(file, node.text) === PROXY_MODULE;
	function visit(node: ts.Node): void {
		if (ts.isImportDeclaration(node) && isProxy(node.moduleSpecifier)) {
			const clause = node.importClause;
			const bindings = clause?.namedBindings;
			if (
				!clause ||
				(!clause.isTypeOnly &&
					(clause.name ||
						!bindings ||
						ts.isNamespaceImport(bindings) ||
						bindings.elements.some((element) => !element.isTypeOnly)))
			) {
				found = true;
			}
		}
		if (
			ts.isExportDeclaration(node) &&
			!node.isTypeOnly &&
			isProxy(node.moduleSpecifier)
		) {
			if (
				!node.exportClause ||
				!ts.isNamedExports(node.exportClause) ||
				node.exportClause.elements.some((element) => !element.isTypeOnly)
			) {
				found = true;
			}
		}
		if (
			ts.isCallExpression(node) &&
			(node.expression.kind === ts.SyntaxKind.ImportKeyword ||
				(ts.isIdentifier(node.expression) &&
					node.expression.text === "require")) &&
			isProxy(node.arguments[0])
		) {
			found = true;
		}
		ts.forEachChild(node, visit);
	}
	visit(tree);
	return found;
}

/** Test files talk to a module double, not the proxy; they don't count. */
export function isCountedFile(file: string): boolean {
	return (
		/^(src|scripts)\//.test(file) &&
		/\.tsx?$/.test(file) &&
		!/\.test\.tsx?$/.test(file) &&
		!/\.d\.ts$/.test(file)
	);
}

export type RatchetResult = {
	ok: boolean;
	message: string;
};

export function compareToBaseline(
	count: number,
	baseline: number,
): RatchetResult {
	if (count > baseline) {
		return {
			ok: false,
			message: `Proxy db imports rose from ${baseline} to ${count}. New code takes a TenantDb (see #33).`,
		};
	}
	if (count < baseline) {
		return {
			ok: true,
			message: `Proxy db imports fell from ${baseline} to ${count}. Lock it in with pnpm proxy-db:baseline.`,
		};
	}
	return { ok: true, message: `Proxy db imports: ${count} (baseline).` };
}
