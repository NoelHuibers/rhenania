import { expect, test } from "vitest";
import { getStockStatus } from "./utils";

test.each([
	[10, 10, { label: "OK", tone: "success" }],
	[10, 12, { label: "Überschuss", tone: "info" }],
	[-2, 0, { label: "Überschuss", tone: "info" }],
	[100, 96, { label: "Toleranz", tone: "warning" }],
	[100, 90, { label: "Warnung", tone: "warning", strong: true }],
	[100, 75, { label: "Verlust", tone: "danger" }],
	[100, 50, { label: "Kritisch", tone: "danger", strong: true }],
	[0, -3, { label: "Verlust", tone: "danger" }],
])("expected %s, counted %s", (calculatedStock, actual, expected) => {
	expect(getStockStatus({ calculatedStock }, actual)).toEqual(expected);
});
