import { describe, expect, test } from "vitest";

import {
	assertWriteAllowed,
	ProductionWriteBlockedError,
	remoteHost,
} from "./guard";

describe("remoteHost", () => {
	test("treats files and localhost as local", () => {
		expect(remoteHost("file:.data/control.db")).toBeNull();
		expect(remoteHost(":memory:")).toBeNull();
		expect(remoteHost("http://127.0.0.1:8080")).toBeNull();
		expect(remoteHost("libsql://localhost:8080")).toBeNull();
	});

	test("extracts the host of remote libSQL URLs", () => {
		expect(remoteHost("libsql://corps-hassia-org.aws-eu-west-1.turso.io")).toBe(
			"corps-hassia-org.aws-eu-west-1.turso.io",
		);
		expect(remoteHost("https://db.example.com/path")).toBe("db.example.com");
	});
});

describe("assertWriteAllowed", () => {
	const prod = "libsql://control-org.turso.io";

	test("allows local databases without confirmation", () => {
		expect(assertWriteAllowed("file:/tmp/x.db", "migrate", {})).toBeNull();
	});

	test("blocks remote databases without CONFIRM_PROD", () => {
		expect(() => assertWriteAllowed(prod, "migrate", {})).toThrow(
			ProductionWriteBlockedError,
		);
		expect(() =>
			assertWriteAllowed(prod, "migrate", { CONFIRM_PROD: "other.turso.io" }),
		).toThrow(/CONFIRM_PROD=control-org\.turso\.io/);
	});

	test("allows a remote database when CONFIRM_PROD names exactly its host", () => {
		expect(
			assertWriteAllowed(prod, "migrate", {
				CONFIRM_PROD: "control-org.turso.io",
			}),
		).toBe("control-org.turso.io");
	});

	test("requires a URL", () => {
		expect(() => assertWriteAllowed(undefined, "migrate", {})).toThrow(
			/No database URL/,
		);
	});
});
