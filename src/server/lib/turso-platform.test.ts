import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	createDatabase,
	createDatabaseToken,
	databaseExists,
	deleteDatabase,
	tursoDatabaseNameForSlug,
} from "./turso-platform";

// Fake credentials: the real env is empty in tests and the setup guard
// refuses to run if a platform token is set.
const env = vi.hoisted(() => ({
	TURSO_PLATFORM_TOKEN: "platform-token" as string | undefined,
	TURSO_ORG_SLUG: "rhenania-org" as string | undefined,
	TURSO_GROUP: "corps",
}));
vi.mock("~/env", () => ({ env }));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	env.TURSO_PLATFORM_TOKEN = "platform-token";
	env.TURSO_ORG_SLUG = "rhenania-org";
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});

function lastRequest() {
	const [url, init] = fetchMock.mock.lastCall ?? [];
	return { url: String(url), init: init as RequestInit };
}

describe("createDatabase", () => {
	test("creates the DB in the configured group and returns its libsql URL", async () => {
		fetchMock.mockResolvedValueOnce(
			json({
				database: {
					Name: "corps-hassia",
					Hostname: "corps-hassia-rhenania-org.turso.io",
				},
			}),
		);

		const db = await createDatabase("corps-hassia");

		expect(db).toEqual({
			name: "corps-hassia",
			hostname: "corps-hassia-rhenania-org.turso.io",
			url: "libsql://corps-hassia-rhenania-org.turso.io",
		});
		const { url, init } = lastRequest();
		expect(url).toBe(
			"https://api.turso.tech/v1/organizations/rhenania-org/databases",
		);
		expect(init.method).toBe("POST");
		expect(JSON.parse(String(init.body))).toEqual({
			name: "corps-hassia",
			group: "corps",
		});
		expect(init.headers).toEqual({
			Authorization: "Bearer platform-token",
			"Content-Type": "application/json",
		});
	});

	test("reports status and JSON error body of failed calls", async () => {
		fetchMock.mockResolvedValueOnce(
			json({ error: "database already exists" }, 409),
		);

		await expect(createDatabase("corps-hassia")).rejects.toThrow(
			'Turso API POST /organizations/rhenania-org/databases failed: 409 {"error":"database already exists"}',
		);
	});

	test("reports the status of failed calls with a plain-text body (#152)", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response("Bad Gateway", { status: 502 }),
		);

		await expect(createDatabase("corps-hassia")).rejects.toThrow(
			/failed: 502 "Bad Gateway"/,
		);
	});

	test("refuses to run without platform token or org slug", async () => {
		env.TURSO_PLATFORM_TOKEN = undefined;
		await expect(createDatabase("corps-x")).rejects.toThrow(
			/TURSO_PLATFORM_TOKEN is not set/,
		);

		env.TURSO_PLATFORM_TOKEN = "platform-token";
		env.TURSO_ORG_SLUG = undefined;
		await expect(createDatabase("corps-x")).rejects.toThrow(
			/TURSO_ORG_SLUG is not set/,
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("tokens and deletion", () => {
	test("mints a non-expiring full-access token for the DB", async () => {
		fetchMock.mockResolvedValueOnce(json({ jwt: "jwt-123" }));

		expect(await createDatabaseToken("corps-hassia")).toBe("jwt-123");
		const { url, init } = lastRequest();
		expect(url).toBe(
			"https://api.turso.tech/v1/organizations/rhenania-org/databases/corps-hassia/auth/tokens?expiration=never&authorization=full-access",
		);
		expect(init.method).toBe("POST");
	});

	test("deletes a DB by name", async () => {
		fetchMock.mockResolvedValueOnce(json({ database: "corps-hassia" }));

		await deleteDatabase("corps-hassia");

		const { url, init } = lastRequest();
		expect(url).toBe(
			"https://api.turso.tech/v1/organizations/rhenania-org/databases/corps-hassia",
		);
		expect(init.method).toBe("DELETE");
	});
});

describe("databaseExists", () => {
	test("is true for 200 and false for 404", async () => {
		fetchMock.mockResolvedValueOnce(json({ database: {} }));
		expect(await databaseExists("corps-hassia")).toBe(true);
		expect(lastRequest().init.method).toBe("GET");

		fetchMock.mockResolvedValueOnce(json({ error: "not found" }, 404));
		expect(await databaseExists("corps-nope")).toBe(false);
	});

	test("rethrows other failures", async () => {
		fetchMock.mockResolvedValueOnce(json({ error: "unauthorized" }, 401));
		await expect(databaseExists("corps-hassia")).rejects.toThrow(/401/);
	});

	test("a 404 with a plain-text body counts as missing (#152)", async () => {
		fetchMock.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));
		expect(await databaseExists("corps-nope")).toBe(false);
	});
});

describe("tursoDatabaseNameForSlug", () => {
	test("prefixes and lowercases the slug", () => {
		expect(tursoDatabaseNameForSlug("hassia")).toBe("corps-hassia");
		expect(tursoDatabaseNameForSlug("Rhenania-2")).toBe("corps-rhenania-2");
	});

	test("rejects names Turso would refuse", () => {
		expect(tursoDatabaseNameForSlug("a".repeat(26))).toHaveLength(32);
		for (const slug of ["a".repeat(27), "corps_x", "x.y", "über"]) {
			expect(() => tursoDatabaseNameForSlug(slug)).toThrow(
				/produces invalid Turso DB name/,
			);
		}
	});
});
