import { expect, test } from "vitest";

import { normalizePaypalLink } from "./paypal";

test.each([
	["https://paypal.me/CorpsKasse", "https://paypal.me/CorpsKasse"],
	["https://paypal.me/CorpsKasse///", "https://paypal.me/CorpsKasse"],
	["HTTP://www.paypal.me/CorpsKasse/", "HTTP://www.paypal.me/CorpsKasse"],
	["paypal.me/CorpsKasse", "https://paypal.me/CorpsKasse"],
	["www.PayPal.me/CorpsKasse/", "https://paypal.me/CorpsKasse"],
	["@CorpsKasse", "https://paypal.me/CorpsKasse"],
	["  CorpsKasse  ", "https://paypal.me/CorpsKasse"],
])("normalizePaypalLink(%j) → %s", (raw, expected) => {
	expect(normalizePaypalLink(raw)).toBe(expected);
});

test("callers can append an amount without a double slash", () => {
	expect(`${normalizePaypalLink("paypal.me/Bier/")}/12.50`).toBe(
		"https://paypal.me/Bier/12.50",
	);
});
