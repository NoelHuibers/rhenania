import { expect, test } from "vitest";

import { academicTimeLabel } from "./academic-time";

test.each([
	[20, 0, "20 Uhr s.t."],
	[20, 15, "20 Uhr c.t."],
	[20, 30, "20 Uhr m.c.t."],
	[20, 45, "20 Uhr m.m.c.t."],
	[9, 15, "9 Uhr c.t."],
	[0, 0, "0 Uhr s.t."],
])("%i:%i is %s", (hours, minutes, label) => {
	expect(academicTimeLabel(hours, minutes)).toBe(label);
});

test.each([
	[20, 10, "20:10 Uhr"],
	[9, 5, "09:05 Uhr"],
	[23, 59, "23:59 Uhr"],
])("off-quarter %i:%i falls back to %s", (hours, minutes, label) => {
	expect(academicTimeLabel(hours, minutes)).toBe(label);
});
