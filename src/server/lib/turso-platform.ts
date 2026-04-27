// turso-platform.ts — minimal wrapper around the Turso Platform API.
//
// Used by the superadmin tenant-provisioning flow to create a new libSQL DB
// for a tenant in the configured group, mint a long-lived auth token for it,
// and (for cleanup on failure) delete it again.
//
// Docs: https://docs.turso.tech/api-reference

import { env } from "~/env";

const API_BASE = "https://api.turso.tech/v1";

function requireConfig(): { token: string; org: string; group: string } {
	if (!env.TURSO_PLATFORM_TOKEN) {
		throw new Error(
			"TURSO_PLATFORM_TOKEN is not set — superadmin tenant provisioning requires it.",
		);
	}
	if (!env.TURSO_ORG_SLUG) {
		throw new Error(
			"TURSO_ORG_SLUG is not set — superadmin tenant provisioning requires it.",
		);
	}
	return {
		token: env.TURSO_PLATFORM_TOKEN,
		org: env.TURSO_ORG_SLUG,
		group: env.TURSO_GROUP,
	};
}

async function tursoFetch<T>(
	path: string,
	init: RequestInit & { method: string },
): Promise<T> {
	const { token } = requireConfig();
	const res = await fetch(`${API_BASE}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...(init.headers ?? {}),
		},
	});
	if (!res.ok) {
		let body: unknown;
		try {
			body = await res.json();
		} catch {
			body = await res.text();
		}
		throw new Error(
			`Turso API ${init.method} ${path} failed: ${res.status} ${JSON.stringify(body)}`,
		);
	}
	return (await res.json()) as T;
}

export type CreatedDatabase = {
	name: string;
	hostname: string;
	url: string;
};

export async function createDatabase(name: string): Promise<CreatedDatabase> {
	const { org, group } = requireConfig();
	const data = await tursoFetch<{
		database: { Name: string; Hostname: string };
	}>(`/organizations/${org}/databases`, {
		method: "POST",
		body: JSON.stringify({ name, group }),
	});
	const hostname = data.database.Hostname;
	return {
		name: data.database.Name,
		hostname,
		url: `libsql://${hostname}`,
	};
}

export async function createDatabaseToken(name: string): Promise<string> {
	const { org } = requireConfig();
	const data = await tursoFetch<{ jwt: string }>(
		`/organizations/${org}/databases/${name}/auth/tokens?expiration=never&authorization=full-access`,
		{ method: "POST" },
	);
	return data.jwt;
}

export async function deleteDatabase(name: string): Promise<void> {
	const { org } = requireConfig();
	await tursoFetch(`/organizations/${org}/databases/${name}`, {
		method: "DELETE",
	});
}

export async function databaseExists(name: string): Promise<boolean> {
	const { org } = requireConfig();
	try {
		await tursoFetch(`/organizations/${org}/databases/${name}`, {
			method: "GET",
		});
		return true;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (msg.includes("404")) return false;
		throw e;
	}
}

// Validates Turso DB-name conventions: lowercase letters, digits, dashes,
// 3-32 chars, must start with a letter. Tenant slug should already conform.
export function tursoDatabaseNameForSlug(slug: string): string {
	const candidate = `corps-${slug}`.toLowerCase();
	if (!/^[a-z][a-z0-9-]{2,31}$/.test(candidate)) {
		throw new Error(
			`Tenant slug '${slug}' produces invalid Turso DB name '${candidate}'. Use lowercase letters, digits, and dashes; 3-32 chars total.`,
		);
	}
	return candidate;
}
