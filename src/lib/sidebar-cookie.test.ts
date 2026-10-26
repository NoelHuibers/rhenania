import { expect, test } from "vitest";
import { isSidebarOpen } from "./sidebar-cookie";

test("the sidebar starts expanded only when the member left it expanded", () => {
	expect(isSidebarOpen("true")).toBe(true);
	expect(isSidebarOpen("false")).toBe(false);
	expect(isSidebarOpen(undefined)).toBe(false);
	expect(isSidebarOpen("garbage")).toBe(false);
});
