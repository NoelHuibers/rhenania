// Page loaders (#33): the role gate the pages ran inline, then the page data.

import { describe, expect, test } from "vitest";

import {
	createEtaplan,
	createKonto,
	createKostenpunkt,
} from "../../../test/factories/cc-kasse";
import {
	createBeitragRun,
	createMember,
	setMemberStatuses,
} from "../../../test/factories/members";
import {
	countQueries,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	signOut,
} from "../../../test/harness";
import { loadAdresslistePage } from "./adressliste";
import { loadCcKassePage } from "./cc-kasse";
import { loadKontenPage } from "./konten";
import { requirePageRoles } from "./page-access";

setupTestDatabases();

/** Where a loader redirected to (Next's redirect() throws). */
async function redirectTarget(load: Promise<unknown>) {
	const error = (await load.catch((e: unknown) => e)) as { digest?: string };
	return error.digest?.split(";")[2];
}

describe("requirePageRoles", () => {
	test("sends signed-out visitors to the sign-in page", async () => {
		await createTenant();
		signOut();

		expect(await redirectTarget(requirePageRoles(["Admin"]))).toBe(
			"/auth/signin",
		);
	});

	test("sends members without an allowed role to /access-denied", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Fuchs"] }));

		expect(await redirectTarget(requirePageRoles(["Admin"]))).toBe(
			"/access-denied",
		);
	});

	test("returns all role names in one tenant query after auth()", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin", "Senior"] }));

		const { result, tenant } = await countQueries(() =>
			requirePageRoles(["Senior"]),
		);

		expect(result.sort()).toEqual(["Admin", "Senior"]);
		// auth() reads the roles once, the gate once more (as the pages did).
		expect(tenant).toBe(2);
	});
});

describe("page loaders", () => {
	test("Adressliste: members, edit right and status options", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		await createMember({ lastName: "Muster" });

		const page = await loadAdresslistePage();

		expect(page.canEdit).toBe(true);
		expect(page.members.map((m) => m.lastName)).toEqual(["Muster"]);
		expect(page.statusOptions?.length).toBeGreaterThan(0);

		await setMemberStatuses([{ key: "XY", label: "Testerei" }]);
		expect((await loadAdresslistePage()).statusOptions).toContainEqual({
			value: "XY",
			label: "Testerei",
		});
	});

	test("Konten: accounts, and the admin flag only for admins", async () => {
		await createTenant();
		await createKonto({ bankName: "Hausbank" });
		signInAs(await createUser({ roles: ["CC-Kasse"] }));

		const page = await loadKontenPage();

		expect(page.isAdmin).toBe(false);
		expect(page.initialKontos.map((k) => k.bankName)).toEqual(["Hausbank"]);

		signInAs(await createUser({ roles: ["Admin"] }));
		expect((await loadKontenPage()).isAdmin).toBe(true);
	});

	test("CC-Kasse: the selected Etatplan, Beitrag runs only for the treasury", async () => {
		await createTenant();
		const older = await createEtaplan({ name: "SS 2026" });
		const wanted = await createEtaplan({ name: "WS 2026/27" });
		const run = await createBeitragRun(await createKostenpunkt(wanted.id));
		signInAs(await createUser({ roles: ["Senior"] }));

		const senior = await loadCcKassePage(
			Promise.resolve({ etaplan: wanted.id }),
		);
		expect(senior.isTreasury).toBe(false);
		expect(senior.selectedEtaplan?.id).toBe(wanted.id);
		expect(senior.beitragRuns).toEqual([]);
		expect(senior.etaplans.map((e) => e.id).sort()).toEqual(
			[older.id, wanted.id].sort(),
		);

		signInAs(await createUser({ roles: ["CC-Kasse"] }));
		const kasse = await loadCcKassePage(Promise.resolve({ etaplan: "nope" }));
		expect(kasse.isTreasury).toBe(true);
		expect(kasse.selectedEtaplan).not.toBeNull();
		expect(kasse.beitragRuns.map((r) => r.id)).toEqual([run.id]);
		expect(kasse.selectedBeitrag).not.toBeNull();
	});
});
