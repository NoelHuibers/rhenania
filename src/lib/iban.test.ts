import assert from "node:assert/strict";
import { test } from "vitest";
import {
	formatIban,
	ibanSchema,
	isValidIban,
	isValidIbanStructure,
	normalizeIban,
} from "./iban";

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

test("accepts valid IBANs of other countries", () => {
	for (const iban of [
		"GB82WEST12345698765432",
		"CH9300762011623852957",
		"NL91ABNA0417164300",
		"BE68539007547034",
		"FR1420041010050500013M02606",
		// Norway is not in the length table: checksum only.
		"NO9386011117947",
	]) {
		assert.equal(isValidIban(iban), true, iban);
	}
});

test("rejects a German IBAN that is one character too long", () => {
	assert.equal(isValidIban("DE893704004405320130000"), false);
});

test("normalizes whitespace and case", () => {
	assert.equal(
		normalizeIban(" de89 3704\t0044 0532\n0130 00 "),
		"DE89370400440532013000",
	);
});

test("member IBANs only get a structural check, no checksum", () => {
	// Wrong checksum, but structurally fine: stored as submitted.
	assert.equal(isValidIbanStructure("DE89370400440532013001"), true);
	assert.equal(isValidIbanStructure("de12 3456 7890 12"), true);
	// Only 9 characters after the check digits.
	assert.equal(isValidIbanStructure("DE12345678901"), false);
	assert.equal(isValidIbanStructure("D189370400440532013000"), false);
	assert.equal(isValidIbanStructure("DEAB370400440532013000"), false);
	assert.equal(isValidIbanStructure(`DE12${"1".repeat(31)}`), false);
});

test("ibanSchema normalizes before validating", () => {
	assert.equal(
		ibanSchema.parse("de89 3704 0044 0532 0130 00"),
		"DE89370400440532013000",
	);
	const empty = ibanSchema.safeParse("");
	assert.equal(empty.success, false);
	assert.equal(empty.error?.issues[0]?.message, "IBAN ist erforderlich");
	const bad = ibanSchema.safeParse("DE12");
	assert.equal(bad.error?.issues[0]?.message, "Ungültige IBAN");
});
