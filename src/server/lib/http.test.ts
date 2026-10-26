import { describe, expect, test } from "vitest";

import { readErrorBody } from "./http";

describe("readErrorBody", () => {
	test("parses JSON bodies", async () => {
		const res = Response.json({ error: "invalid_grant" }, { status: 400 });
		expect(await readErrorBody(res)).toEqual({ error: "invalid_grant" });
	});

	test("returns plain-text and empty bodies as text", async () => {
		expect(
			await readErrorBody(new Response("Bad Gateway", { status: 502 })),
		).toBe("Bad Gateway");
		expect(await readErrorBody(new Response(null, { status: 503 }))).toBe("");
	});

	test("gives up quietly on a body that was already read", async () => {
		const res = new Response("gone", { status: 500 });
		await res.text();
		expect(await readErrorBody(res)).toBeNull();
	});
});
