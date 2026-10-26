import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { generateUserBillPDF } from "~/server/actions/billings/createUserPDF";
import type { TenantBranding } from "~/server/db/control-schema";
import { tenants } from "~/server/db/control-schema";
import { getraenkeBillingConfig, kontos } from "~/server/db/schema";
import { getGetraenkekassePayment } from "~/server/lib/getraenkekasse-payment";
import { clearTenantCache } from "~/server/lib/tenant-context";
import {
	createBillPeriodRow,
	createBillRow,
	createKontoRow,
	OTHER_VALID_IBAN,
	pdfText,
	setGetraenkeBillingProfile,
	VALID_IBAN,
} from "../../../test/factories/billing";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import {
	applyBillingProfileBackfill,
	describeStep,
	planBillingProfileBackfill,
	RHENANIA_LEGACY_BILLING,
} from "./billing-profile-backfill";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => {});
});

const LEGACY = {
	iban: "DE65 5002 4024 3386 7890 30",
	ibanRaw: "DE65500240243386789030",
	accountHolder: "Noel Huibers",
	paypalBaseUrl: "https://paypal.me/CorpsRhenaniaBier",
};

async function rhenania(branding: TenantBranding | null = null) {
	const tenant = await createTenant({ slug: "rhenania" });
	if (branding) {
		await controlDb()
			.update(tenants)
			.set({ branding })
			.where(eq(tenants.id, tenant.id));
		clearTenantCache(tenant.id);
	}
	return tenant;
}

async function backfill(branding: TenantBranding | null = null) {
	const plan = await planBillingProfileBackfill(tenantDb(), branding);
	await applyBillingProfileBackfill(tenantDb(), plan);
	return plan;
}

describe("Rhenania backfill (#9)", () => {
	test("Rhenania's bill PDF text is identical after the backfill", async () => {
		await rhenania();
		const member = await createUser({ name: "Max Muster" });
		const period = await createBillPeriodRow({
			billNumber: "KW-43-26",
			createdAt: new Date("2026-10-21T12:00:00Z"),
		});
		const bill = await createBillRow({
			periodId: period.id,
			user: member,
			drinksTotal: 3,
			oldBillingAmount: 20,
			fees: 2,
			items: [
				{ drinkName: "Wasser", amount: 1, pricePerDrink: 1 },
				{ drinkName: "Pils", amount: 2, pricePerDrink: 1 },
			],
		});
		// Without data the bill is refused instead of naming a stranger.
		expect((await generateUserBillPDF(bill.id)).success).toBe(false);

		const plan = await backfill();

		expect(plan.steps.map((s) => s.kind)).toEqual([
			"insert-profile",
			"insert-konto",
		]);
		// Captured from the code before #9 (fallback values, no konto).
		const legacyText = JSON.parse(
			readFileSync(
				path.join(
					import.meta.dirname,
					"../../../test/fixtures/rhenania-legacy-bill-text.json",
				),
				"utf8",
			),
		) as string[];
		const pdf = (await generateUserBillPDF(bill.id)).pdfContent as Buffer;
		expect(pdfText(pdf)).toEqual(legacyText);
		expect(await getGetraenkekassePayment()).toEqual(LEGACY);
	});

	test("is idempotent", async () => {
		await rhenania();
		await backfill();

		const again = await planBillingProfileBackfill(tenantDb(), null);

		expect(again).toMatchObject({ steps: [], unchanged: true });
		await applyBillingProfileBackfill(tenantDb(), again);
		expect(await tenantDb().select().from(kontos)).toHaveLength(1);
	});

	test("keeps a valid konto and adds the PayPal it used to fall back to", async () => {
		await rhenania();
		const konto = await createKontoRow({ paypalLink: null });

		const plan = await backfill();

		expect(plan.steps.map(describeStep)).toEqual([
			expect.stringContaining("create getraenke_billing_config"),
			`set PayPal of konto ${konto.id} to https://paypal.me/CorpsRhenaniaBier`,
		]);
		expect(await getGetraenkekassePayment()).toEqual({
			...LEGACY,
			iban: "DE89 3704 0044 0532 0130 00",
			ibanRaw: VALID_IBAN,
		});
	});

	test("leaves the PayPal to the branding when the tenant has one", async () => {
		const branding = {
			paypalUrl: "@RhenaniaBranding",
			billingWebsite: "www.example.org/trinken",
		};
		await rhenania(branding);
		await createKontoRow({ paypalLink: null });

		const plan = await backfill(branding);

		expect(plan.steps.map((s) => s.kind)).toEqual(["insert-profile"]);
		expect((await getGetraenkekassePayment())?.paypalBaseUrl).toBe(
			"https://paypal.me/RhenaniaBranding",
		);
		const [profile] = await tenantDb().select().from(getraenkeBillingConfig);
		expect(profile?.website).toBe("www.example.org/trinken");
	});

	test("replaces an invalid konto IBAN by the old default, keeping its PayPal", async () => {
		await rhenania();
		const broken = await createKontoRow({ paypalLink: "@brokenkasse" });
		await tenantDb()
			.update(kontos)
			.set({ iban: "DE89370400440532013001" })
			.where(eq(kontos.id, broken.id));

		const plan = await backfill();

		expect(plan.warnings).toEqual([
			expect.stringContaining("has an invalid IBAN"),
		]);
		expect(await getGetraenkekassePayment()).toEqual({
			...LEGACY,
			paypalBaseUrl: "https://paypal.me/brokenkasse",
		});
	});

	test("only fills empty profile fields", async () => {
		await rhenania();
		await createKontoRow({ paypalLink: "@kasse" });
		await setGetraenkeBillingProfile({
			senderName: "",
			senderStreet: "",
			senderCity: "",
			location: "",
			website: "www.custom.example",
			accountHolder: "Noel Huibers",
		});

		const plan = await backfill();

		expect(plan.steps).toEqual([
			{
				kind: "fill-profile",
				values: {
					senderName: "Noel Huibers",
					senderStreet: RHENANIA_LEGACY_BILLING.senderStreet,
					senderCity: RHENANIA_LEGACY_BILLING.senderCity,
					location: "München",
				},
			},
		]);
		const [profile] = await tenantDb().select().from(getraenkeBillingConfig);
		expect(profile).toMatchObject({
			senderName: "Noel Huibers",
			website: "www.custom.example",
		});
	});

	test("refuses to write anything that would change the bills", async () => {
		await rhenania();
		await createKontoRow({ iban: OTHER_VALID_IBAN, paypalLink: "@kasse" });
		await setGetraenkeBillingProfile({ paymentDueDays: 21 });

		const plan = await planBillingProfileBackfill(tenantDb(), null);

		expect(plan.unchanged).toBe(false);
		expect(plan.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("paymentDueDays is 21"),
				expect.stringContaining("nothing is written"),
			]),
		);
		await expect(applyBillingProfileBackfill(tenantDb(), plan)).rejects.toThrow(
			"Refusing",
		);
	});
});
