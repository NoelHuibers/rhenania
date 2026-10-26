import assert from "node:assert/strict";
import { test } from "vitest";
import {
	defaultFeatureFlags,
	FEATURE_KEYS,
	FEATURES,
	isFeatureKey,
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

test("only registered keys are feature keys, not prototype members", () => {
	assert.equal(isFeatureKey("drinks.markup"), true);
	for (const key of [
		"toString",
		"constructor",
		"__proto__",
		"",
		"DRINKS.MARKUP",
	])
		assert.equal(isFeatureKey(key), false);
});

test("the last row for a key wins", () => {
	const flags = resolveFeatureFlags([
		{ key: "drinks.markup", enabled: true },
		{ key: "drinks.markup", enabled: false },
	]);
	assert.equal(flags["drinks.markup"], false);
});

test("defaults are a fresh object per call", () => {
	const flags = defaultFeatureFlags();
	flags["drinks.markup"] = true;
	assert.equal(defaultFeatureFlags()["drinks.markup"], false);
});

test("every flag has a German label and description for the superadmin UI", () => {
	for (const key of FEATURE_KEYS) {
		assert.ok(FEATURES[key].label.length > 0);
		assert.ok(FEATURES[key].description.length > 0);
	}
});
