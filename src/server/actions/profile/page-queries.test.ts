// Query budget of /profile (#24): the page loads every card on the server,
// in parallel, with a constant number of round trips however long the
// member's history is. The order list is one page, never the whole history.

import { describe, expect, test } from "vitest";

import { getMyPaymentInfo } from "~/server/actions/cc-kasse/paymentInfo";
import {
	getMyFuchsenOrders,
	getMyFuchsenSummary,
} from "~/server/actions/fuchsenladen/orders";
import { getMyMember } from "~/server/actions/members/myMember";
import { getMyOrdersPage } from "~/server/actions/orders";
import { getUserAchievements } from "~/server/actions/profile/achievements";
import { getConnectedAccountsAction } from "~/server/actions/profile/auth";
import { getUserBillingData } from "~/server/actions/profile/getUserBill";
import { getUserProfile } from "~/server/actions/profile/profile";
import { auth } from "~/server/auth";
import { getEloStatsForUser } from "~/server/lib/elo-stats";
import { getOpenBill } from "~/server/lib/open-bill";
import {
	getProfilePreferencesForUser,
	isEloEnabledForUser,
} from "~/server/lib/preferences";
import {
	createBillPeriodRow,
	createBillRow,
	setUserPreference,
} from "../../../../test/factories/billing";
import {
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../../test/factories/fuchsenladen";
import { seedAchievementDefinitions } from "../../../../test/factories/game";
import { createOrderRow, daysAgo } from "../../../../test/factories/inventory";
import { createMember } from "../../../../test/factories/members";
import {
	countQueries,
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
} from "../../../../test/harness";

setupTestDatabases();

/**
 * Everything `src/app/(protected)/profile/page.tsx` loads on the server: the
 * page's session check, then each card's loader (ProfileSections.tsx,
 * OpenBillSection and GamesEloContainer), all started together.
 */
async function loadProfilePage() {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) {
		throw new Error("not signed in");
	}
	const [
		profile,
		accounts,
		preferences,
		paymentInfo,
		member,
		bill,
		fuchsenOrders,
		fuchsenSummary,
		orders,
		achievements,
		openBill,
		elo,
	] = await Promise.all([
		getUserProfile(),
		getConnectedAccountsAction(),
		getProfilePreferencesForUser(userId),
		getMyPaymentInfo(),
		getMyMember(),
		getUserBillingData(),
		getMyFuchsenOrders(),
		getMyFuchsenSummary(),
		getMyOrdersPage(),
		getUserAchievements(),
		getOpenBill(userId),
		(async () => {
			const s = await auth();
			const id = s?.user?.id ?? "";
			return (await isEloEnabledForUser(id))
				? await getEloStatsForUser(id)
				: null;
		})(),
	]);
	return {
		profile,
		accounts,
		preferences,
		paymentInfo,
		member,
		bill,
		fuchsenOrders,
		fuchsenSummary,
		orders,
		achievements,
		openBill,
		elo,
	};
}

let round = 0;

/** `n` more Getränke orders, Fuchsenladen orders and bills for `user`. */
async function addHistory(user: TestUser, n: number) {
	const drink = await createDrink({ name: `Pils ${++round}`, price: 1.5 });
	const item = await createFuchsenItem({ name: `Mate ${round}`, price: 2 });
	for (let i = 0; i < n; i++) {
		await createOrderRow({
			drink,
			user,
			amount: 1,
			createdAt: daysAgo(30 + i),
		});
		await createFuchsenOrder({
			user,
			item,
			status: i % 2 ? "Bezahlt" : "Offen",
		});
		const period = await createBillPeriodRow({ createdAt: daysAgo(60 + i) });
		await createBillRow({
			periodId: period.id,
			user,
			drinksTotal: 3,
			createdAt: daysAgo(60 + i),
			items: [{ drinkName: drink.name, amount: 2, pricePerDrink: 1.5 }],
		});
	}
}

describe("profile page query budget (#24)", () => {
	test("the page load does not grow with the member's history", async () => {
		await createTenant();
		await seedAchievementDefinitions();
		const user = await createUser({ name: "Max" });
		await createMember({ userId: user.id, firstName: "Max" });
		await setUserPreference(user.id, "notifications.emailEnabled", "false");
		signInAs(user);
		await addHistory(user, 2);
		await loadProfilePage(); // warm the tenant and feature caches

		const small = await countQueries(loadProfilePage);
		await addHistory(user, 10);
		const large = await countQueries(loadProfilePage);

		expect(large.total).toBe(small.total);
		expect(large.writes).toBe(0);
		expect(small.total).toBe(PROFILE_PAGE_BUDGET);

		// One page of orders, newest first, with the full count.
		expect(large.result.orders.orders).toHaveLength(5);
		expect(large.result.orders.total).toBe(12);
		const times = large.result.orders.orders.map((o) => o.createdAt.getTime());
		expect(times).toEqual([...times].sort((a, b) => b - a));
		expect(large.result.fuchsenOrders).toHaveLength(12);
		expect(large.result.preferences).toEqual({
			elo: true,
			challengeNotifications: true,
			email: false,
			publicProfile: true,
		});
		expect(large.result.member?.userId).toBe(user.id);
		expect(large.result.bill.billItems).toHaveLength(1);
	});
});

/**
 * 27 data queries plus 12 auth() calls (the page's and each guarded
 * loader's) at 2 lookups each (membership, roles). The test mock of auth() is
 * not memoized; in production it is memoized per request (React cache), so
 * the session costs 2 lookups per page there. The four preference switches
 * are one query (was four, each behind its own session lookup). The tenant's
 * auth config comes with its cached Better Auth instance (#27), not from a
 * query per request.
 */
const PROFILE_PAGE_BUDGET = 27 + 2 * 12;
