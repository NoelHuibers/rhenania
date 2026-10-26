import { expect, test } from "vitest";

import { cn } from "./utils";

test("cn joins conditional classes and lets later Tailwind classes win", () => {
	expect(cn("px-2", false && "hidden", undefined, "py-1")).toBe("px-2 py-1");
	expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4");
	expect(cn({ "font-bold": true, italic: false }, ["mt-1", "mt-2"])).toBe(
		"font-bold mt-2",
	);
});
