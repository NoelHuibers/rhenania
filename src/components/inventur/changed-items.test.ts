import assert from "node:assert/strict";
import { test } from "vitest";
import { removeSavedItemIds } from "./changed-items";

test("removes every item included in a successful save", () => {
	const changedItems = new Set(["drink-1", "drink-2", "drink-3"]);

	assert.deepEqual(
		removeSavedItemIds(changedItems, ["drink-1", "drink-2", "drink-3"]),
		new Set(),
	);
});

test("preserves changes that were not part of the saved snapshot", () => {
	const changedItems = new Set(["saved-drink", "newer-change"]);

	assert.deepEqual(
		removeSavedItemIds(changedItems, ["saved-drink"]),
		new Set(["newer-change"]),
	);
});
