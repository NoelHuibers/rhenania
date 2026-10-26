import { describe, expect, test } from "vitest";

import { userPaymentInfo } from "~/server/db/schema";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { getMyPaymentInfo, setMyPaymentInfo } from "./paymentInfo";

setupTestDatabases();

describe("my payment info", () => {
	test("is empty until saved, then stores a normalized IBAN", async () => {
		await createTenant();
		signInAs(await createUser());
		expect(await getMyPaymentInfo()).toBeNull();

		const result = await setMyPaymentInfo({
			accountHolder: "Max Muster",
			iban: "de89 3704 0044 0532 0130 00",
		});

		expect(result).toEqual({ success: true });
		expect(await getMyPaymentInfo()).toEqual({
			accountHolder: "Max Muster",
			iban: "DE89370400440532013000",
		});
	});

	test("saving again updates the single row", async () => {
		await createTenant();
		const user = await createUser();
		signInAs(user);
		await setMyPaymentInfo({
			accountHolder: "Alt",
			iban: "DE89370400440532013000",
		});

		await setMyPaymentInfo({
			accountHolder: "Neu",
			iban: "AT611904300234573201",
		});

		const rows = await tenantDb().select().from(userPaymentInfo);
		expect(rows).toEqual([
			expect.objectContaining({
				userId: user.id,
				accountHolder: "Neu",
				iban: "AT611904300234573201",
			}),
		]);
	});

	test("each user only sees their own", async () => {
		await createTenant();
		signInAs(await createUser());
		await setMyPaymentInfo({
			accountHolder: "A",
			iban: "DE89370400440532013000",
		});

		signInAs(await createUser());
		expect(await getMyPaymentInfo()).toBeNull();
	});

	test.each([
		[
			{ accountHolder: "", iban: "DE89370400440532013000" },
			"Kontoinhaber ist erforderlich",
		],
		[{ accountHolder: "A", iban: "DE12" }, "Ungültige IBAN"],
	])("rejects %o", async (input, error) => {
		await createTenant();
		signInAs(await createUser());

		expect(await setMyPaymentInfo(input)).toEqual({ success: false, error });
		expect(await tenantDb().select().from(userPaymentInfo)).toHaveLength(0);
	});

	test("requires a session", async () => {
		await createTenant();
		expect(await getMyPaymentInfo()).toBeNull();
		expect(
			await setMyPaymentInfo({
				accountHolder: "A",
				iban: "DE89370400440532013000",
			}),
		).toEqual({ success: false, error: "Nicht angemeldet" });
	});
});
