import assert from "node:assert/strict";
import { test } from "vitest";
import {
	defaultFeatureFlags,
	FEATURE_KEYS,
	resolveFeatureFlags,
} from "./features";

test("every flag is off by default", () => {
	const flags = defaultFeatureFlags();
	assert.equal(FEATURE_KEYS.length > 0, true);
	for (const key of FEATURE_KEYS) assert.equal(flags[key], false);
});

test("stored rows switch individual flags on", () => {
	const flags = resolveFeatureFlags([{ key: "drinks.markup", enabled: true }]);
	assert.equal(flags["drinks.markup"], true);
	assert.equal(flags["billing.markAllPaid"], false);
});

test("a disabled row keeps the flag off", () => {
	const flags = resolveFeatureFlags([{ key: "drinks.markup", enabled: false }]);
	assert.equal(flags["drinks.markup"], false);
});

test("unknown keys are ignored", () => {
	const flags = resolveFeatureFlags([{ key: "removed.flag", enabled: true }]);
	assert.deepEqual(flags, defaultFeatureFlags());
});
