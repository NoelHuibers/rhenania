import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import { kontos } from "~/server/db/schema";
import {
	createKontoRow,
	OTHER_VALID_IBAN,
	setGetraenkeBillingProfile,
	VALID_IBAN,
} from "../../../test/factories/billing";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
	type TestTenant,
	tenantDb,
} from "../../../test/harness";
import { requireTenant } from "../../../test/state";
import {
	GETRAENKE_BILLING_INCOMPLETE,
	getGetraenkeBillingProfile,
	getGetraenkekasseAccount,
	getGetraenkekassePayment,
	incompleteBillingMessage,
	resolveGetraenkeBillSender,
	resolveGetraenkekassePayment,
} from "./getraenkekasse-payment";
import { clearTenantCache } from "./tenant-context";

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

describe("getGetraenkekassePayment", () => {
	test("is null without a konto, never someone else's account (#9)", async () => {
		await createTenant();
		await setGetraenkeBillingProfile();

		expect(await getGetraenkekassePayment()).toBeNull();
		expect(await getGetraenkekasseAccount()).toBeNull();
	});

	test("is null without an account holder (#9)", async () => {
		await createTenant();
		await createKontoRow();

		expect(await getGetraenkekassePayment()).toBeNull();
		expect(await getGetraenkekasseAccount()).toMatchObject({
			ibanRaw: VALID_IBAN,
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

		expect(await getGetraenkekassePayment()).toEqual({
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

		expect(await getGetraenkekassePayment()).toBeNull();

		// A second, valid konto is used instead.
		await createKontoRow({ iban: OTHER_VALID_IBAN });
		expect((await getGetraenkekassePayment())?.ibanRaw).toBe(OTHER_VALID_IBAN);
	});

	test("takes PayPal from the tenant branding when the konto has none", async () => {
		const tenant = await createTenant();
		await setGetraenkeBillingProfile();
		await createKontoRow({ paypalLink: null });

		expect((await getGetraenkekassePayment())?.paypalBaseUrl).toBeNull();

		await setBranding(tenant, "paypal.me/brandkasse");
		expect((await getGetraenkekassePayment())?.paypalBaseUrl).toBe(
			"https://paypal.me/brandkasse",
		);

		await createKontoRow({ kasseType: "CC-Kasse", paypalLink: "@cc" });
		await tenantDb()
			.update(kontos)
			.set({ paypalLink: "@kontokasse" })
			.where(eq(kontos.kasseType, "Getränkekasse"));
		expect((await getGetraenkekassePayment())?.paypalBaseUrl).toBe(
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

describe("resolveGetraenkeBillSender", () => {
	test("lists everything missing for a fresh tenant", async () => {
		await createTenant();

		expect(await resolveGetraenkeBillSender()).toEqual({
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

		expect(await resolveGetraenkeBillSender()).toEqual({
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

		expect(await resolveGetraenkeBillSender()).toEqual({
			ok: false,
			missing: ["Getränkekasse-Konto mit gültiger IBAN"],
		});
	});
});

describe("getGetraenkeBillingProfile", () => {
	test("is empty before the migration created the table", async () => {
		await createTenant();
		vi.spyOn(console, "error").mockImplementation(() => {});
		await requireTenant().client.execute("DROP TABLE getraenke_billing_config");

		expect((await getGetraenkeBillingProfile()).senderName).toBe("");
		expect((await resolveGetraenkeBillSender()).ok).toBe(false);
	});
});

test("incompleteBillingMessage names what is missing", () => {
	expect(incompleteBillingMessage(["Absender", "Kontoinhaber"])).toBe(
		`${GETRAENKE_BILLING_INCOMPLETE} (fehlt: Absender, Kontoinhaber).`,
	);
	expect(incompleteBillingMessage([])).toBe(`${GETRAENKE_BILLING_INCOMPLETE}.`);
});
