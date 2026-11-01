import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { kontos } from "~/server/db/schema";
import {
	createKontoRow,
	OTHER_VALID_IBAN,
	VALID_IBAN,
} from "../../../../test/factories/billing";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	signOut,
	tenantDb,
} from "../../../../test/harness";
import { createKonto, deleteKonto, getKontos, updateKonto } from "./actions";

setupTestDatabases();

const INVALID_IBAN =
	"Ungültige IBAN. Bitte Länge und Prüfziffer kontrollieren.";

const input = {
	kasseType: "Getränkekasse",
	iban: "de89 3704 0044 0532 0130 00",
	bic: "COBADEFFXXX",
	bankName: "Commerzbank",
};

async function kontoById(id: string) {
	const [row] = await tenantDb().select().from(kontos).where(eq(kontos.id, id));
	return row;
}

describe("createKonto", () => {
	test("Admin creates a konto with a normalized IBAN", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));

		const result = await createKonto({
			...input,
			paypalLink: "https://paypal.me/kasse",
		});

		expect(result.ok).toBe(true);
		const row = await kontoById(result.ok ? result.data.id : "");
		expect(row).toMatchObject({
			kasseType: "Getränkekasse",
			iban: VALID_IBAN,
			paypalLink: "https://paypal.me/kasse",
			description: null,
			isActive: true,
		});
	});

	test("rejects IBANs with a wrong checksum or length", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));

		for (const iban of ["DE89370400440532013001", "DE8937040044053201300"]) {
			expect(await createKonto({ ...input, iban })).toEqual({
				ok: false,
				error: INVALID_IBAN,
				code: "INVALID_INPUT",
			});
		}
		expect(await tenantDb().select().from(kontos)).toHaveLength(0);
	});

	test("is reserved for Admins", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		expect(await createKonto(input)).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
		expect(await tenantDb().select().from(kontos)).toHaveLength(0);
	});
});

describe("getKontos", () => {
	test("Admins see every konto, kasse roles only the ones they manage", async () => {
		await createTenant();
		await createKontoRow({ kasseType: "Getränkekasse" });
		await createKontoRow({ kasseType: "CC-Kasse" });
		await createKontoRow({ kasseType: "AHV Kasse" });

		signInAs(await createUser({ roles: ["Admin"] }));
		const asAdmin = await getKontos();
		expect(asAdmin.map((k) => k.kasseType)).toEqual([
			"AHV Kasse",
			"CC-Kasse",
			"Getränkekasse",
		]);

		signInAs(await createUser({ roles: ["Getränkewart"] }));
		const asWart = await getKontos();
		expect(asWart.map((k) => k.kasseType)).toEqual(["Getränkekasse"]);

		signInAs(await createUser({ roles: ["CC-Kasse"] }));
		const asCc = await getKontos();
		expect(asCc.map((k) => k.kasseType)).toEqual(["CC-Kasse"]);

		signInAs(await createUser());
		expect(await getKontos()).toEqual([]);

		signOut();
		await expect(getKontos()).rejects.toThrow("Nicht angemeldet");
	});
});

describe("updateKonto", () => {
	test("Getränkewart edits the Getränkekasse konto but cannot change its type", async () => {
		await createTenant();
		const konto = await createKontoRow();
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		const result = await updateKonto(konto.id, {
			iban: "de02 1203 0000 0000 2020 51",
			paypalLink: "@neuekasse",
			isActive: false,
			kasseType: "AHV Kasse",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(await kontoById(konto.id)).toMatchObject({
			kasseType: "Getränkekasse",
			iban: OTHER_VALID_IBAN,
			paypalLink: "@neuekasse",
			isActive: false,
			bankName: "Testbank",
		});
	});

	test("Admin may change the type", async () => {
		await createTenant();
		const konto = await createKontoRow();
		signInAs(await createUser({ roles: ["Admin"] }));

		await updateKonto(konto.id, { kasseType: "AHV Kasse" });

		expect((await kontoById(konto.id))?.kasseType).toBe("AHV Kasse");
	});

	test("rejects other kassen, invalid IBANs and unknown kontos", async () => {
		await createTenant();
		const own = await createKontoRow();
		const foreign = await createKontoRow({ kasseType: "Aktivenkasse" });
		signInAs(await createUser({ roles: ["Getränkewart"] }));

		expect(await updateKonto(foreign.id, { bankName: "X" })).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
		expect(await updateKonto(own.id, { iban: "DE00123" })).toEqual({
			ok: false,
			error: INVALID_IBAN,
			code: "INVALID_INPUT",
		});
		expect(await updateKonto("missing", { bankName: "X" })).toEqual({
			ok: false,
			error: "Konto nicht gefunden",
			code: "NOT_FOUND",
		});
		expect(await kontoById(foreign.id)).toMatchObject({ bankName: "Testbank" });
		expect(await kontoById(own.id)).toMatchObject({ iban: VALID_IBAN });
	});
});

describe("deleteKonto", () => {
	test("only Admins delete kontos", async () => {
		await createTenant();
		const konto = await createKontoRow();

		signInAs(await createUser({ roles: ["Getränkewart"] }));
		expect(await deleteKonto(konto.id)).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
		expect(await kontoById(konto.id)).toBeDefined();

		signInAs(await createUser({ roles: ["Admin"] }));
		expect(await deleteKonto(konto.id)).toEqual({ ok: true, data: undefined });
		expect(await kontoById(konto.id)).toBeUndefined();
	});
});
