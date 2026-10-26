import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import { kontos } from "~/server/db/schema";
import {
	createKontoRow,
	OTHER_VALID_IBAN,
	VALID_IBAN,
} from "../../../test/factories/billing";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
	type TestTenant,
	tenantDb,
} from "../../../test/harness";
import {
	DEFAULT_GETRAENKEKASSE_PAYMENT,
	getGetraenkekassePayment,
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
	test("falls back to the default account without a konto", async () => {
		await createTenant();

		expect(await getGetraenkekassePayment()).toEqual({
			iban: DEFAULT_GETRAENKEKASSE_PAYMENT.iban,
			ibanRaw: "DE65500240243386789030",
			accountHolder: DEFAULT_GETRAENKEKASSE_PAYMENT.accountHolder,
			paypalBaseUrl: DEFAULT_GETRAENKEKASSE_PAYMENT.paypalBaseUrl,
		});
	});

	test("uses the active Getränkekasse konto for IBAN and PayPal", async () => {
		await createTenant();
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
			accountHolder: DEFAULT_GETRAENKEKASSE_PAYMENT.accountHolder,
			paypalBaseUrl: "https://paypal.me/corpskasse",
		});
	});

	test("never hands out an invalid konto IBAN", async () => {
		await createTenant();
		const konto = await createKontoRow();
		// Legacy row written before IBAN validation existed.
		await tenantDb()
			.update(kontos)
			.set({ iban: "DE89370400440532013001" })
			.where(eq(kontos.id, konto.id));

		const payment = await getGetraenkekassePayment();

		expect(payment.iban).toBe(DEFAULT_GETRAENKEKASSE_PAYMENT.iban);
	});

	test("takes PayPal from the tenant branding when the konto has none", async () => {
		const tenant = await createTenant();
		await setBranding(tenant, "paypal.me/brandkasse");
		await createKontoRow({ paypalLink: null });

		expect((await getGetraenkekassePayment()).paypalBaseUrl).toBe(
			"https://paypal.me/brandkasse",
		);

		await createKontoRow({ kasseType: "CC-Kasse", paypalLink: "@cc" });
		await tenantDb()
			.update(kontos)
			.set({ paypalLink: "@kontokasse" })
			.where(eq(kontos.kasseType, "Getränkekasse"));
		expect((await getGetraenkekassePayment()).paypalBaseUrl).toBe(
			"https://paypal.me/kontokasse",
		);
	});
});
