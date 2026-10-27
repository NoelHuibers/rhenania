import { describe, expect, test } from "vitest";

import {
	girocodePayload,
	paymentReference,
	paypalAmountUrl,
} from "./bill-payment";

describe("bill payment helpers", () => {
	test("the reference names the member and the bill", () => {
		expect(paymentReference("Max Muster", "KW-43-26")).toBe(
			"Max Muster - Rechnung KW-43-26",
		);
	});

	test("PayPal gets the amount in cents with a dot", () => {
		expect(paypalAmountUrl("https://paypal.me/Kasse", 23.4)).toBe(
			"https://paypal.me/Kasse/23.40EUR",
		);
		expect(paypalAmountUrl("https://paypal.me/Kasse/", 0.1 + 0.2)).toBe(
			"https://paypal.me/Kasse/0.30EUR",
		);
		expect(paypalAmountUrl("https://paypal.me/Kasse", Number.NaN)).toBe(
			"https://paypal.me/Kasse/0.00EUR",
		);
	});

	test("the GiroCode follows EPC069-12", () => {
		const payload = girocodePayload({
			accountHolder: "Getränkekasse",
			ibanRaw: "DE89370400440532013000",
			amount: 15.4,
			reference: "Max - Rechnung 7",
		});
		expect(payload.split("\n")).toEqual([
			"BCD",
			"002",
			"1",
			"SCT",
			"",
			"Getränkekasse",
			"DE89370400440532013000",
			"EUR15.40",
			"",
			"",
			"Max - Rechnung 7",
		]);
		expect(
			girocodePayload({
				accountHolder: "",
				ibanRaw: "",
				amount: Number.POSITIVE_INFINITY,
				reference: "",
			}),
		).toContain("EUR0.00");
	});
});
