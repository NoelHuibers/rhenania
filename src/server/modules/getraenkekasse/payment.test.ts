import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import { kontos } from "~/server/db/schema";
import {
	GETRAENKE_BILLING_INCOMPLETE,
	incompleteBillingMessage,
	resolveGetraenkekassePayment,
} from "~/server/domain/getraenkekasse/payment";
import { clearTenantCache } from "~/server/lib/tenant-context";
import {
	createKontoRow,
	OTHER_VALID_IBAN,
	setGetraenkeBillingProfile,
	VALID_IBAN,
} from "../../../../test/factories/billing";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
	type TestTenant,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import {
	billingProfile,
	billingSettings,
	billSender,
	payment,
} from "./service";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function setBranding(tenant: TestTenant, paypalUrl: string) {
	await controlDb()
		.update(tenants)
		.set({ branding: { paypalUrl } })
		.where(eq(tenants.id, tenant.id));
	clearTenantCache(tenant.id);
}

describe("payment", () => {
	test("is null without a konto, never someone else's account (#9)", async () => {
		await createTenant();
		await setGetraenkeBillingProfile();

		expect(await payment(testScope())).toBeNull();
		expect((await billingSettings(testScope())).payment).toBeNull();
	});

	test("is null without an account holder (#9)", async () => {
		await createTenant();
		await createKontoRow();

		expect(await payment(testScope())).toBeNull();
		expect((await billingSettings(testScope())).payment).toMatchObject({
			iban: "DE89 3704 0044 0532 0130 00",
		});
	});

	test("uses the active Getränkekasse konto and the configured holder", async () => {
		await createTenant();
		await setGetraenkeBillingProfile({ accountHolder: " Corps Hassia e.V. " });
		await createKontoRow({ kasseType: "Aktivenkasse", iban: OTHER_VALID_IBAN });
		await createKontoRow({
			iban: OTHER_VALID_IBAN,
			paypalLink: "https://paypal.me/old",
			isActive: false,
		});
		await createKontoRow({ iban: VALID_IBAN, paypalLink: "@corpskasse/" });

		expect(await payment(testScope())).toEqual({
			iban: "DE89 3704 0044 0532 0130 00",
			ibanRaw: VALID_IBAN,
			accountHolder: "Corps Hassia e.V.",
			paypalBaseUrl: "https://paypal.me/corpskasse",
		});
	});

	test("never hands out an invalid konto IBAN", async () => {
		await createTenant();
		await setGetraenkeBillingProfile();
		const konto = await createKontoRow();
		// Legacy row written before IBAN validation existed.
		await tenantDb()
			.update(kontos)
			.set({ iban: "DE89370400440532013001" })
			.where(eq(kontos.id, konto.id));

		expect(await payment(testScope())).toBeNull();

		// A second, valid konto is used instead.
		await createKontoRow({ iban: OTHER_VALID_IBAN });
		expect((await payment(testScope()))?.ibanRaw).toBe(OTHER_VALID_IBAN);
	});

	test("takes PayPal from the tenant branding when the konto has none", async () => {
		const tenant = await createTenant();
		await setGetraenkeBillingProfile();
		await createKontoRow({ paypalLink: null });

		expect((await payment(testScope()))?.paypalBaseUrl).toBeNull();

		await setBranding(tenant, "paypal.me/brandkasse");
		expect((await payment(testScope()))?.paypalBaseUrl).toBe(
			"https://paypal.me/brandkasse",
		);

		await createKontoRow({ kasseType: "CC-Kasse", paypalLink: "@cc" });
		await tenantDb()
			.update(kontos)
			.set({ paypalLink: "@kontokasse" })
			.where(eq(kontos.kasseType, "Getränkekasse"));
		expect((await payment(testScope()))?.paypalBaseUrl).toBe(
			"https://paypal.me/kontokasse",
		);
	});
});

describe("resolveGetraenkekassePayment", () => {
	test("treats blank PayPal links and holders as missing", () => {
		expect(
			resolveGetraenkekassePayment(
				[{ iban: VALID_IBAN, paypalLink: "  " }],
				"Kasse",
				"",
			)?.paypalBaseUrl,
		).toBeNull();
		expect(
			resolveGetraenkekassePayment(
				[{ iban: VALID_IBAN, paypalLink: null }],
				"   ",
			),
		).toBeNull();
	});
});

describe("billSender", () => {
	test("lists everything missing for a fresh tenant", async () => {
		await createTenant();

		expect(await billSender(testScope())).toEqual({
			ok: false,
			missing: [
				"Absender",
				"Straße",
				"PLZ und Ort",
				"Kontoinhaber",
				"Getränkekasse-Konto mit gültiger IBAN",
			],
		});
	});

	test("returns the complete sender and derives the place from the city", async () => {
		await createTenant();
		await setGetraenkeBillingProfile({
			location: "",
			website: "www.corps.example",
			paymentDueDays: 10,
		});
		await createKontoRow({ paypalLink: null });

		expect(await billSender(testScope())).toEqual({
			ok: true,
			sender: {
				name: "Erika Kassenwart",
				street: "Hauptstraße 1",
				city: "70173 Stuttgart",
				location: "Stuttgart",
				website: "www.corps.example",
				paymentDueDays: 10,
				payment: {
					iban: "DE89 3704 0044 0532 0130 00",
					ibanRaw: VALID_IBAN,
					accountHolder: "Corps Test e.V.",
					paypalBaseUrl: null,
				},
			},
		});
	});

	test("only the konto missing", async () => {
		await createTenant();
		await setGetraenkeBillingProfile();

		expect(await billSender(testScope())).toEqual({
			ok: false,
			missing: ["Getränkekasse-Konto mit gültiger IBAN"],
		});
	});
});

describe("billingProfile", () => {
	test("is empty while none is stored", async () => {
		await createTenant();

		expect((await billingProfile(testScope())).senderName).toBe("");
		expect((await billSender(testScope())).ok).toBe(false);
	});

	// A failed read must not look like "not set up yet" (#33).
	test("a failed read is an error, not an empty profile", async () => {
		await createTenant();
		await requireTenant().client.execute("DROP TABLE getraenke_billing_config");

		await expect(billingProfile(testScope())).rejects.toThrow(/Failed query/);
		await expect(billSender(testScope())).rejects.toThrow(/Failed query/);
	});
});

test("incompleteBillingMessage names what is missing", () => {
	expect(incompleteBillingMessage(["Absender", "Kontoinhaber"])).toBe(
		`${GETRAENKE_BILLING_INCOMPLETE} (fehlt: Absender, Kontoinhaber).`,
	);
	expect(incompleteBillingMessage([])).toBe(`${GETRAENKE_BILLING_INCOMPLETE}.`);
});
