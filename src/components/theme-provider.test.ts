import { expect, test } from "vitest";
import { isLightOnlyPath } from "./theme-provider";

test.each([
	"/",
	"/contact",
	"/impressum/",
	"/datenschutz",
	"/studentenverbindung-stuttgart",
	"/studentenzimmer-stuttgart",
])("public page %s stays light", (path) => {
	expect(isLightOnlyPath(path)).toBe(true);
});

test.each([
	"/trinken",
	"/auth/signin",
	"/superadmin",
	"/access-denied",
	"/contact-admin",
	"/profile",
])("app page %s follows the member's theme", (path) => {
	expect(isLightOnlyPath(path)).toBe(false);
});
