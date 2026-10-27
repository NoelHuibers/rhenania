// Importing the auth module must not need the control DB (#27): the proxy
// imports it, so a failing query at module load used to take down every
// page of a cold instance, public ones included.

import { expect, test, vi } from "vitest";

import { testState } from "../../../test/state";

vi.unmock("~/server/auth");

test("importing the auth module touches no database", async () => {
	expect(testState.control).toBeNull(); // any control-DB access would throw

	const mod = await import("./index");

	expect(mod.getAuthForTenant).toBeTypeOf("function");
});
