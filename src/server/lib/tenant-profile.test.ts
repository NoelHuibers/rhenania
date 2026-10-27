import { describe, expect, test } from "vitest";

import { createTenant, setupTestDatabases } from "../../../test/harness";
import {
	addressLine,
	getTenantProfile,
	parseFoundingDay,
	phoneHref,
	semproProfile,
	tenantProfile,
} from "./tenant-profile";

setupTestDatabases();

describe("tenant profile (#36)", () => {
	test("reads the identity from the tenant record and its branding", async () => {
		await createTenant({
			displayName: "Corps Hassia Darmstadt",
			branding: {
				legalName: "Corps Hassia zu Darmstadt",
				street: " Musterweg 5 ",
				city: "64283 Darmstadt",
				phone: "+49 6151 12345",
				contactEmail: "info@hassia.example",
				operator: "AHV der Hassia e.V.",
				representative: "Max Muster",
				instagramUrl: "https://instagram.com/hassia",
				wikipediaUrl: "https://de.wikipedia.org/wiki/Hassia",
			},
		});

		const profile = await getTenantProfile();

		expect(profile).toEqual({
			displayName: "Corps Hassia Darmstadt",
			legalName: "Corps Hassia zu Darmstadt",
			street: "Musterweg 5",
			city: "64283 Darmstadt",
			phone: "+49 6151 12345",
			contactEmail: "info@hassia.example",
			operator: "AHV der Hassia e.V.",
			representative: "Max Muster",
			instagramUrl: "https://instagram.com/hassia",
			wikipediaUrl: "https://de.wikipedia.org/wiki/Hassia",
		});
		expect(addressLine(profile)).toBe("Musterweg 5, 64283 Darmstadt");
		expect(phoneHref("+49 6151 12345")).toBe("tel:+49615112345");
	});

	test("leaves out what is not stored, never filling in another Corps", async () => {
		await createTenant({ displayName: "Corps Neu" });

		const profile = await getTenantProfile();

		expect(profile).toMatchObject({
			displayName: "Corps Neu",
			legalName: "Corps Neu",
			street: null,
			city: null,
			contactEmail: null,
			operator: null,
		});
		expect(addressLine(profile)).toBeNull();
		expect(addressLine({ ...profile, city: "12345 Musterstadt" })).toBe(
			"12345 Musterstadt",
		);
	});

	test("is neutral without a tenant", async () => {
		expect(await getTenantProfile()).toMatchObject({
			displayName: "Corps",
			legalName: "Corps",
		});
	});

	test("drops links and addresses that could inject markup or script", () => {
		const profile = tenantProfile({
			displayName: "Corps X",
			branding: {
				instagramUrl: "javascript:alert(1)",
				wikipediaUrl: "  ",
				contactEmail: "a@b.example?subject=x y",
			},
		});
		expect(profile.instagramUrl).toBeNull();
		expect(profile.wikipediaUrl).toBeNull();
		expect(profile.contactEmail).toBeNull();
	});

	test("parses the founding day", () => {
		expect(parseFoundingDay("02-21")).toEqual({ month: 2, day: 21 });
		expect(parseFoundingDay("02-29")).toEqual({ month: 2, day: 29 });
		for (const bad of [undefined, "", "2-21", "13-01", "02-30", "00-10", 221]) {
			expect(parseFoundingDay(bad), String(bad)).toBeNull();
		}
	});

	test("builds the SemPro letterhead from the address when no lines are stored", () => {
		const sempro = semproProfile({
			displayName: "Corps Y",
			branding: {
				street: "Weg 1",
				city: "12345 Stadt",
				phone: "0123 4567",
				contactEmail: "cc@y.example",
				sempro: { contactLines: [" ", 3 as unknown as string] },
			},
		});
		expect(sempro.name).toBe("Corps Y");
		expect(sempro.contactLines).toEqual([
			"Weg 1",
			"12345 Stadt",
			"Tel.: 0123 4567",
			"cc@y.example",
		]);
		expect(sempro.stammtischName).toBe("Stammtisch");
		expect(sempro.logoFile).toBeNull();
	});

	test("accepts only a bare PNG file name as SemPro logo", () => {
		const logo = (logoFile: string) =>
			semproProfile({ displayName: "C", branding: { sempro: { logoFile } } })
				.logoFile;
		expect(logo("Wappen_Tranzparent.png")).toBe("Wappen_Tranzparent.png");
		expect(logo("../../.env")).toBeNull();
		expect(logo("../secret.png")).toBeNull();
		expect(logo("wappen.svg")).toBeNull();
	});
});
