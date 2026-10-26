// scripts/lib/guard.ts — refuse to write to a remote database by accident.
//
// `.env` holds the production credentials, so every ops script and every
// `drizzle-kit migrate` would otherwise write to production silently. Local
// files and localhost need nothing; for anything else the operator has to
// name the database host explicitly:
//
//   CONFIRM_PROD=<db-host> pnpm db:migrate-tenants
//
// CI's release pipeline sets CONFIRM_PROD the same way.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Hostname of a libSQL/HTTP database URL, or null for local files. */
export function remoteHost(url: string): string | null {
	if (url.startsWith("file:") || url === ":memory:") {
		return null;
	}
	const host = new URL(url.replace(/^libsql:/, "https:")).hostname;
	return LOCAL_HOSTS.has(host) ? null : host;
}

export class ProductionWriteBlockedError extends Error {
	constructor(
		readonly host: string,
		what: string,
	) {
		super(
			`Refusing to ${what} on remote database "${host}".\n` +
				`If you really mean it, run again with CONFIRM_PROD=${host}`,
		);
		this.name = "ProductionWriteBlockedError";
	}
}

/**
 * Throws unless `url` is local or CONFIRM_PROD names its host.
 * Returns the remote host (or null) for logging.
 */
export function assertWriteAllowed(
	url: string | undefined,
	what = "write",
	env: Record<string, string | undefined> = process.env,
): string | null {
	if (!url) {
		throw new Error("No database URL configured.");
	}
	const host = remoteHost(url);
	if (host && env.CONFIRM_PROD !== host) {
		throw new ProductionWriteBlockedError(host, what);
	}
	return host;
}

/** Script entry helper: prints the guard message and exits with code 2. */
export function guardOrExit(url: string | undefined, what: string) {
	try {
		const host = assertWriteAllowed(url, what);
		if (host) {
			console.warn(`⚠ Writing to remote database ${host} (CONFIRM_PROD set).`);
		}
	} catch (error) {
		console.error((error as Error).message);
		process.exit(2);
	}
}
