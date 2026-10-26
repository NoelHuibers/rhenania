import assert from "node:assert/strict";
import { test } from "vitest";
import { formatIban, isValidIban } from "./iban";

test("accepts valid IBANs with or without spaces", () => {
	assert.equal(isValidIban("DE89 3704 0044 0532 0130 00"), true);
	assert.equal(isValidIban("de89370400440532013000"), true);
	assert.equal(isValidIban("AT611904300234573201"), true);
});

test("rejects a truncated IBAN", () => {
	// 18 characters instead of the 22 a German IBAN needs.
	assert.equal(isValidIban("DE5170190000282433"), false);
});

test("rejects an IBAN with a wrong checksum", () => {
	assert.equal(isValidIban("DE89370400440532013001"), false);
});

test("rejects malformed input", () => {
	assert.equal(isValidIban(""), false);
	assert.equal(isValidIban("not an iban"), false);
});

test("formats an IBAN into blocks of four", () => {
	assert.equal(
		formatIban("de89370400440532013000"),
		"DE89 3704 0044 0532 0130 00",
	);
});
