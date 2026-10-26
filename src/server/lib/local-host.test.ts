import { describe, expect, test } from "vitest";

import { isLocalHost, protocolForHost } from "./local-host";

describe("isLocalHost", () => {
	test.each([
		"localhost",
		"localhost:3000",
		"LOCALHOST:3000",
		"hassia.localhost",
		"hassia.localhost:3000",
		"rhenania.test.localhost:3000",
		"127.0.0.1",
		"127.0.0.1:3000",
		"127.1.2.3:8080",
		"[::1]",
		"[::1]:3000",
	])("%s is local", (host) => {
		expect(isLocalHost(host)).toBe(true);
	});

	test.each([
		"hassia.de",
		"rhenania-stuttgart.de:443",
		"localhost.example.com",
		"mylocalhost",
		"127.0.0.1.example.com",
		"128.0.0.1",
		"[2001:db8::1]:3000",
		"[::1",
		"",
	])("%s is public", (host) => {
		expect(isLocalHost(host)).toBe(false);
	});
});

describe("protocolForHost", () => {
	test("http for local hosts, https for everything else", () => {
		expect(protocolForHost("hassia.localhost:3000")).toBe("http");
		expect(protocolForHost("hassia.de")).toBe("https");
	});
});
