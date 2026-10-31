// Runtime authorization matrix: every server action × every kind of caller.
//
// MATRIX below says who may call each action. It must name every exported
// server action (the list comes from the same source scan as
// authz-guards.test.ts), so a new action fails here until somebody decides
// who may call it. For each action the test signs in as each persona and
// calls it:
//
// - Denied callers must be turned away by the guard: the call reads nothing
//   but the session/role/tenant lookups, writes nothing (row counts of both
//   tenant DBs and the control DB stay the same) and returns no data.
// - Allowed callers must get past the guard (no "not signed in" / "no
//   permission" answer). Most calls then fail on the placeholder arguments,
//   which is fine: the feature tests cover what happens next.
//
// Every call must consult the session; one that doesn't never reached its
// guard (e.g. it rejected the placeholder arguments first) and needs real
// `args` in the matrix.

import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { grantSuperAdmin } from "./factories/platform";
import {
	createTenant,
	createUser,
	flushAfter,
	setupTestDatabases,
	signInAs,
	signOut,
	switchTenant,
	type TestTenant,
	type TestUser,
} from "./harness";
import { countQueries, type QueryLogEntry } from "./query-count";
import {
	PUBLIC_ACTIONS,
	type ServerAction,
	scanServerActions,
} from "./server-actions";
import { requireControl, testState } from "./state";

vi.mock("@vercel/blob", () => ({
	put: vi.fn(async (pathname: string, body: unknown) => {
		// Consume streamed uploads like the real SDK does.
		if (body instanceof ReadableStream) {
			await new Response(body).arrayBuffer();
		}
		const url = `https://blob.test/${pathname}`;
		return { url, downloadUrl: url, pathname };
	}),
	del: vi.fn(async () => undefined),
	head: vi.fn(async () => ({})),
	list: vi.fn(async () => ({ blobs: [], hasMore: false })),
}));
vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));
vi.mock("~/server/lib/turso-platform");
vi.mock("~/server/lib/tenant-provisioning");
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
	recalculateAllAchievements: vi.fn(),
}));

// ─── Who may call what ──────────────────────────────────────────────────────

// Role sets are spelled out instead of imported, so changing who may call an
// action means changing this file too.
const ADMIN = ["Admin"];
const GETRAENKE = ["Getränkewart", "Admin"];
const FUCHSEN = ["Fuchs", "Admin"];
const FOTOS = ["Fotowart", "Admin"];
const CC_EDIT = ["Senior", "CC-Kasse", "Admin"];
const CC_TREASURY = ["CC-Kasse", "Admin"];
const ADRESSLISTE = [
	"Admin",
	"AHV 1. Vorstand",
	"AHV 2. Vorstand",
	"AHV 3. Vorstand",
];

type Access =
	/** Anyone, signed in or not (see PUBLIC_ACTIONS for why). */
	| "public"
	/** Every active member of the request's Corps. */
	| "member"
	/** Platform superadmins, whether or not they are members. */
	| "superadmin"
	/** Active members holding one of these roles. */
	| readonly string[]
	| { roles: readonly string[]; orSuperadmin: true };

/** `other`: a plain member of the Corps who is not the caller. */
type Ctx = { other: TestUser };
type Entry = Access | { access: Access; args: (ctx: Ctx) => unknown[] };

const MATRIX: Record<string, Record<string, Entry>> = {
	"src/lib/formSubmit.ts": { onSubmitAction: "public" },
	"src/server/actions/admin/admin.ts": {
		getUsersWithRoles: ADMIN,
		getRolesWithUserCount: ADMIN,
		initializeRoles: ADMIN,
		assignUserRole: ADMIN,
		removeUserRole: ADMIN,
		toggleUserRole: ADMIN,
		updateUser: ADMIN,
		bulkSetRoleUsers: ADMIN,
		deleteUser: ADMIN,
	},
	"src/server/actions/admin/export.ts": {
		exportTenantData: { roles: ADMIN, orSuperadmin: true },
	},
	"src/server/actions/admin/userRoles.ts": {
		// Self or Admin; asked about somebody else here.
		getUserRoles: { access: ADMIN, args: (c) => [c.other.id] },
		hasAnyRole: { access: ADMIN, args: (c) => [c.other.id, ["Admin"]] },
	},
	"src/server/actions/bilder/homepageImages.ts": {
		saveHomepageImage: FOTOS,
		getAllHomepageImages: FOTOS,
		toggleImageActive: FOTOS,
		deleteHomepageImage: FOTOS,
		updateImageOrder: FOTOS,
	},
	"src/server/actions/bilder/images.ts": {
		getActiveImageBySection: "public",
		getAllActiveImagesBySection: "public",
	},
	"src/server/actions/cc-kasse/einnahmen.ts": {
		createEinnahme: CC_TREASURY,
		updateEinnahme: CC_TREASURY,
		deleteEinnahme: CC_TREASURY,
		listEinnahmen: CC_EDIT,
	},
	"src/server/actions/cc-kasse/etaplans.ts": {
		createEtaplan: CC_EDIT,
		updateEtaplan: CC_EDIT,
		listEtaplans: "member",
		getEtaplanById: "member",
		getActiveEtaplan: "member",
	},
	"src/server/actions/cc-kasse/excel.ts": {
		exportEtaplanXlsx: CC_EDIT,
		importEtaplanXlsx: CC_EDIT,
	},
	"src/server/actions/cc-kasse/kostenerstattungen.ts": {
		submitReimbursement: "member",
		listMyReimbursements: "member",
		cancelMyReimbursement: "member",
		updateMyReimbursement: "member",
		approveReimbursement: CC_TREASURY,
		rejectReimbursement: CC_TREASURY,
		markReimbursementPaid: CC_TREASURY,
		createDirectBooking: CC_TREASURY,
		updateReimbursement: CC_TREASURY,
		listReimbursementQueue: CC_EDIT,
	},
	"src/server/actions/cc-kasse/kostenpunkte.ts": {
		createKostenpunkt: CC_EDIT,
		updateKostenpunkt: CC_EDIT,
		deleteKostenpunkt: CC_EDIT,
		listKostenpunkteForEtaplan: "member",
		linkableEvents: "member",
		getBookableKostenpunkte: "member",
	},
	"src/server/actions/cc-kasse/overview.ts": { getEtaplanOverview: CC_EDIT },
	"src/server/actions/cc-kasse/paymentInfo.ts": {
		getMyPaymentInfo: "member",
		setMyPaymentInfo: "member",
	},
	"src/server/actions/currentOrders.ts": {
		getCurrentOrders: "member",
	},
	"src/server/actions/drinks.ts": {
		addDrink: GETRAENKE,
		updateDrink: GETRAENKE,
		deleteDrink: GETRAENKE,
		toggleDrinkAvailability: GETRAENKE,
		getDrinks: GETRAENKE,
	},
	"src/server/actions/events/calendarToken.ts": {
		getOrCreateCalendarToken: "member",
		rotateCalendarToken: "member",
	},
	"src/server/actions/events/events.ts": {
		getUpcomingEvents: "member",
		getPublicUpcomingEvents: "public",
		getPublicPastEvents: "public",
		getAllEvents: "member",
		createEvent: ADMIN,
		updateEvent: ADMIN,
		deleteEvent: ADMIN,
	},
	"src/server/actions/events/recurring.ts": {
		getAllRecurringEvents: ADMIN,
		createRecurringEvent: ADMIN,
		updateRecurringEvent: ADMIN,
		toggleRecurringEventActive: ADMIN,
		deleteRecurringEvent: ADMIN,
		generateInstances: ADMIN,
		toggleEventCancelled: ADMIN,
	},
	"src/server/actions/events/rsvp.ts": {
		setRsvp: "member",
		removeRsvp: "member",
		getUserRsvpsForEvents: { access: "member", args: () => [["x"]] },
		getRsvpCountsForEvents: "member",
		// RSVP list with e-mail addresses
		getEventRsvps: ADMIN,
		getYesAttendeePreviewForEvents: "member",
		getEventAttendees: "member",
	},
	"src/server/actions/fuchsenladen/billingConfig.ts": {
		getFuchsenBillingConfig: "member",
		updateFuchsenBillingConfig: FUCHSEN,
	},
	// Own bills only, unless Fuchs/Admin (checked per bill).
	"src/server/actions/fuchsenladen/billingPdf.ts": {
		generateFuchsenBillPDF: "member",
	},
	"src/server/actions/fuchsenladen/billings.ts": {
		createNewFuchsenBilling: FUCHSEN,
		getAllFuchsenBillPeriods: FUCHSEN,
		getFuchsenBillsForPeriod: FUCHSEN,
		getUnbilledFuchsenOrdersGrouped: FUCHSEN,
		updateFuchsenBillStatus: FUCHSEN,
		getMyFuchsenBills: "member",
		getFuchsenBillPeriodCSV: FUCHSEN,
	},
	"src/server/actions/fuchsenladen/items.ts": {
		addFuchsenItem: FUCHSEN,
		updateFuchsenItem: FUCHSEN,
		deleteFuchsenItem: FUCHSEN,
		toggleFuchsenItemAvailability: FUCHSEN,
		getFuchsenItems: FUCHSEN,
		getFuchsenItemsForMenu: "member",
	},
	"src/server/actions/fuchsenladen/orders.ts": {
		createFuchsenOrder: "member",
		getMyFuchsenOrders: "member",
		getMyFuchsenSummary: "member",
		getFuchsenBillsByUser: FUCHSEN,
		getFuchsenOrdersForUser: FUCHSEN,
		updateFuchsenOrderStatus: FUCHSEN,
		markAllUserFuchsenOrdersPaid: FUCHSEN,
	},
	"src/server/actions/game/challenge.ts": {
		createChallenge: "member",
		respondToChallenge: "member",
		cancelChallenge: "member",
		proposeResult: "member",
		confirmResult: "member",
		disputeResult: "member",
		getMyChallenges: "member",
	},
	"src/server/actions/game/cross-tenant-challenge.ts": {
		createCrossTenantChallenge: "member",
		respondToCrossTenantChallenge: "member",
		cancelCrossTenantChallenge: "member",
		proposeCrossTenantResult: "member",
		confirmCrossTenantResult: "member",
		disputeCrossTenantResult: "member",
		getMyCrossTenantChallenges: "member",
	},
	"src/server/actions/game/cross-tenant-discovery.ts": {
		getGlobalPeakEloHolder: "member",
		listChallengeableTenants: "member",
		listChallengeableUsers: "member",
		getGlobalLeaderboard: "member",
	},
	"src/server/actions/game/game.ts": {
		getRecentGames: "member",
		getLeaderboard: "member",
	},
	"src/server/actions/game/getUsers.ts": {
		getAllUsers: "member",
		getAllUsersExcept: "member",
	},
	"src/server/actions/inventur/inventur.ts": {
		getInventoryProfit: GETRAENKE,
		getStockData: GETRAENKE,
		getInventoryHistory: GETRAENKE,
		saveInventoryCount: GETRAENKE,
		closeInventoryAndBill: GETRAENKE,
		saveQuickAdjustments: GETRAENKE,
		getActiveEventInventory: GETRAENKE,
		listInventurEvents: GETRAENKE,
		listEtaplansWithKostenpunkte: GETRAENKE,
		cancelEventInventory: GETRAENKE,
		finishEventInventory: GETRAENKE,
	},
	// Kasse roles see and edit the Konto of their own Kasse (checked per Konto).
	"src/server/actions/kontos/kontos.ts": {
		getKontos: "member",
		createKonto: ADMIN,
		updateKonto: "member",
		deleteKonto: ADMIN,
	},
	"src/server/actions/members/linkAccounts.ts": {
		relinkMemberAccounts: ADRESSLISTE,
	},
	"src/server/actions/members/members.ts": {
		listMembers: ADRESSLISTE,
		listMemberStatusOptions: ADRESSLISTE,
		createMember: ADRESSLISTE,
		updateMember: ADRESSLISTE,
		updateMemberFields: ADRESSLISTE,
		deleteMember: ADRESSLISTE,
	},
	"src/server/actions/members/membersExcel.ts": {
		exportMembersXlsx: ADRESSLISTE,
		importMembersXlsx: ADRESSLISTE,
	},
	"src/server/actions/members/myMember.ts": {
		getMyMember: "member",
		updateMyMember: "member",
	},
	"src/server/actions/members/semesterbeitrag.ts": {
		listBeitragRuns: CC_TREASURY,
		createBeitragRun: CC_TREASURY,
		regenerateCharges: CC_TREASURY,
		deleteBeitragRun: CC_TREASURY,
		listChargesForRun: CC_TREASURY,
		markChargePaid: CC_TREASURY,
		markChargeDeferred: CC_TREASURY,
		markChargeUnpaid: CC_TREASURY,
		sendBeitragEmails: CC_TREASURY,
		sendMahnungen: CC_TREASURY,
		downloadChargePdf: CC_TREASURY,
	},
	"src/server/actions/menu.ts": {
		getDrinkMarkupPercent: "member",
		getAvailableDrinks: "member",
		getAllDrinksForMenu: "member",
	},
	"src/server/actions/newuser/users.ts": {
		createUser: ADMIN,
	},
	"src/server/actions/newuser/verifyEmail.ts": {
		verifyEmailAndSetPassword: "public",
	},
	"src/server/actions/orders.ts": {
		createOrder: "member",
		getMyOrdersPage: "member",
	},
	"src/server/actions/profile/achievements.ts": {
		getUserAchievements: "member",
	},
	"src/server/actions/profile/auth.ts": {
		getConnectedAccountsAction: "member",
		disconnectProviderAction: "member",
		changePasswordAction: {
			access: "member",
			args: () => [{ currentPassword: "x", newPassword: "y" }],
		},
		connectProviderAction: "member",
	},
	"src/server/actions/profile/avatar.ts": {
		updateUserAvatarUrl: "member",
		deleteUserAvatar: "member",
	},
	"src/server/actions/profile/preferences.ts": {
		getUserPreference: "member",
		setUserPreference: "member",
		setEloPreferenceAction: {
			access: "member",
			args: () => [{ enabled: true }],
		},
		setPublicProfilePreferenceAction: {
			access: "member",
			args: () => [{ enabled: true }],
		},
		getChallengeNotificationPreferenceAction: "member",
		setChallengeNotificationPreferenceAction: {
			access: "member",
			args: () => [{ enabled: true }],
		},
		setEmailNotificationPreferenceAction: {
			access: "member",
			args: () => [{ enabled: true }],
		},
		getHiddenEventTypes: "member",
		setHiddenEventTypes: "member",
	},
	"src/server/actions/profile/profile.ts": {
		getUserProfile: "member",
		updateUserName: "member",
		syncFromMicrosoft: "member",
		refreshProfile: "member",
	},
	"src/server/actions/profile/public-profile.ts": {
		getPublicProfile: "member",
	},
	"src/server/actions/semesterprogramm/semesterConfig.ts": {
		getSemesterConfig: "member",
		upsertSemesterConfig: ADMIN,
	},
	"src/server/actions/superadmin/tenants.ts": {
		listTenantsAction: "superadmin",
		createTenantAction: "superadmin",
		listTenantProvisioningsAction: "superadmin",
		abandonTenantProvisioningAction: "superadmin",
		getTenantDetailAction: "superadmin",
		setTenantFeatureAction: "superadmin",
		setTenantStatusAction: "superadmin",
		updateTenantDisplayNameAction: "superadmin",
		addTenantDomainAction: "superadmin",
		removeTenantDomainAction: "superadmin",
		updateTenantAuthConfigAction: "superadmin",
	},
	"src/server/actions/transactions/tracking.ts": {
		getTransactions: "member",
		getTransactionCount: "member",
	},
	"src/server/actions/venues.ts": {
		getVenues: "member",
		createVenue: ADMIN,
		updateVenue: ADMIN,
		deleteVenue: ADMIN,
	},
	"src/server/modules/billing/actions.ts": {
		createNewBilling: GETRAENKE,
		getAllBillPeriods: "member",
		getBillsForPeriod: "member",
		updateBillStatus: GETRAENKE,
		saveBillPeriodCSV: "member",
		getUserBillingData: "member",
		downloadUserBillPDF: "member",
	},
	"src/server/modules/getraenkekasse/actions.ts": {
		getKasseSummary: GETRAENKE,
		getBankEntries: GETRAENKE,
		addBankEntry: GETRAENKE,
		deleteBankEntry: GETRAENKE,
		getExternalBills: GETRAENKE,
		addExternalBill: GETRAENKE,
		markExternalBillPaid: GETRAENKE,
		deleteExternalBill: GETRAENKE,
		getPfandWert: GETRAENKE,
		setPfandWert: GETRAENKE,
		getOpenEntityBills: GETRAENKE,
		getOpenMemberBills: GETRAENKE,
		downloadEntityBillPDF: GETRAENKE,
		getGetraenkeSettings: GETRAENKE,
		setMarkupPercent: GETRAENKE,
		setBillRecipient: GETRAENKE,
		getGetraenkeBillingSettings: GETRAENKE,
		updateGetraenkeBillingProfile: GETRAENKE,
		markAllMemberBillsPaid: GETRAENKE,
	},
};

// ─── Personas ───────────────────────────────────────────────────────────────

/** Every role that some action is limited to, one persona each. */
const ROLE_NAMES = [
	...new Set(
		Object.values(MATRIX)
			.flatMap((file) => Object.values(file))
			.map((entry) =>
				typeof entry === "object" && "access" in entry ? entry.access : entry,
			)
			.flatMap((access) =>
				Array.isArray(access)
					? access
					: typeof access === "object" && "roles" in access
						? access.roles
						: [],
			),
	),
].sort();

type Persona = {
	name: string;
	/** Active member of the request's Corps with these roles, or null. */
	memberRoles: string[] | null;
	superadmin?: boolean;
	/** Calls on a host that maps to no Corps (request bypassed the proxy). */
	noTenantHost?: boolean;
	setUp: (home: TestTenant, other: TestTenant) => Promise<TestUser | null>;
};

/** Every role above, in `tenant`. */
const allRolesIn = (tenant: TestTenant) => ({
	roles: ROLE_NAMES,
	tenantId: tenant.id,
});

const PERSONAS: Persona[] = [
	{ name: "anonymous", memberRoles: null, setUp: async () => null },
	{
		name: "signed in, member of no Corps",
		memberRoles: null,
		setUp: () => createUser({ tenantId: null }),
	},
	{
		name: "Admin of another Corps",
		memberRoles: null,
		setUp: (_home, other) => createUser(allRolesIn(other)),
	},
	{
		name: "suspended Admin",
		memberRoles: null,
		setUp: (home) =>
			createUser({ ...allRolesIn(home), membership: "suspended" }),
	},
	{
		name: "Admin, on a host without a Corps",
		memberRoles: null,
		noTenantHost: true,
		setUp: (home) => createUser(allRolesIn(home)),
	},
	{
		name: "superadmin (not a member)",
		memberRoles: null,
		superadmin: true,
		setUp: async () => {
			const user = await createUser({ tenantId: null });
			await grantSuperAdmin(user.id);
			return user;
		},
	},
	{
		name: "member",
		memberRoles: [],
		setUp: (home) => createUser({ tenantId: home.id }),
	},
	...ROLE_NAMES.map(
		(role): Persona => ({
			name: role,
			memberRoles: [role],
			setUp: (home) => createUser({ roles: [role], tenantId: home.id }),
		}),
	),
];

function mayCall(access: Access, persona: Persona): boolean {
	if (access === "public") {
		return true;
	}
	if (access === "superadmin") {
		return persona.superadmin === true;
	}
	const roles = persona.memberRoles;
	if (access === "member") {
		return roles !== null;
	}
	if ("orSuperadmin" in access && persona.superadmin) {
		return true;
	}
	const allowed = "roles" in access ? access.roles : access;
	return roles?.some((r) => allowed.includes(r)) ?? false;
}

// ─── Observing a call ───────────────────────────────────────────────────────

/** Tables the guards themselves read (session, roles, tenant context). */
const GUARD_TABLES = new Set([
	"role",
	"user_role",
	"control_tenant",
	"control_tenant_domain",
	"control_tenant_feature",
	"control_tenant_auth_config",
	"control_tenant_membership",
	"control_super_admin",
]);

function tablesOf(log: QueryLogEntry[]): string[] {
	const tables = new Set<string>();
	for (const sql of log.flatMap((e) => e.sql)) {
		for (const m of sql.matchAll(/\b(?:from|join|into|update)\s+"(\w+)"/gi)) {
			tables.add(m[1] as string);
		}
	}
	return [...tables];
}

const DENIAL =
	/nicht (angemeldet|authentifiziert|autorisiert)|authentifizierung erforderlich|keine berechtigung|musst angemeldet|unauthori[sz]ed|not authenticated|must be authenticated|superadmin required|NEXT_REDIRECT/i;

type Outcome = { threw: boolean; value: unknown };

function isDenial({ threw, value }: Outcome): boolean {
	if (threw) {
		const error = value as Error;
		return error?.name === "AuthzError" || DENIAL.test(String(error?.message));
	}
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const v = value as { error?: unknown; message?: unknown };
		return (
			DENIAL.test(String(v.error ?? "")) || DENIAL.test(String(v.message ?? ""))
		);
	}
	return false;
}

/** Data in a denied caller's answer: rows, strings, `success`/`ok: true`. */
function leakedData(value: unknown, key = ""): string | null {
	if (value === null || value === undefined || typeof value === "boolean") {
		return (key === "success" || key === "ok") && value === true
			? `${key}: true`
			: null;
	}
	if (typeof value === "number") {
		return value === 0 ? null : `${key || "value"}: ${value}`;
	}
	if (typeof value === "string") {
		return ["error", "message", "code"].includes(key)
			? null
			: `${key || "value"}: ${value.slice(0, 40)}`;
	}
	if (Array.isArray(value)) {
		return value.length === 0
			? null
			: `${key || "value"}: ${value.length} rows`;
	}
	if (typeof value === "object") {
		for (const [k, v] of Object.entries(value)) {
			const leak = leakedData(v, k);
			if (leak) {
				return leak;
			}
		}
	}
	return null;
}

// Counts how often the session is consulted (auth(), getIdentity(), …).
let sessionReads = 0;
let currentUser: TestUser | null = null;
beforeAll(() => {
	Object.defineProperty(testState, "sessionUser", {
		configurable: true,
		get: () => {
			sessionReads++;
			return currentUser;
		},
		set: (user: TestUser | null) => {
			currentUser = user;
		},
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
	// No action may reach the network from here.
	vi.stubGlobal("fetch", async () => {
		throw new Error("network disabled in the authz matrix");
	});
});
afterAll(() => {
	vi.unstubAllGlobals();
});

async function rowCounts(): Promise<Record<string, number>> {
	const counts: Record<string, number> = {};
	const dbs = [
		["control", requireControl().client] as const,
		...[...testState.tenants.entries()].map(
			([id, t]) => [`tenant ${id.slice(0, 8)}`, t.client] as const,
		),
	];
	for (const [label, client] of dbs) {
		const tables = await client.execute(
			"select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'",
		);
		for (const row of tables.rows) {
			const name = String(row.name);
			const result = await client.execute(
				`select count(*) as n from "${name}"`,
			);
			counts[`${label}.${name}`] = Number(result.rows[0]?.n);
		}
	}
	return counts;
}

/** Makes the simulated request come from `persona`. */
function actAs(persona: Persona, user: TestUser | null, home: TestTenant) {
	if (user) {
		signInAs(user);
	} else {
		signOut();
	}
	if (persona.noTenantHost) {
		testState.tenantId = null;
		testState.headers = { host: "no-corps.example" };
	} else {
		switchTenant(home);
		testState.headers = {};
	}
}

type Call = Awaited<ReturnType<typeof call>>;

async function call(
	fn: (...args: unknown[]) => Promise<unknown>,
	args: unknown[],
) {
	sessionReads = 0;
	const counted = await countQueries(async (): Promise<Outcome> => {
		try {
			return { threw: false, value: await fn(...args) };
		} catch (error) {
			return { threw: true, value: error };
		}
	});
	// Let `after()` work finish before the next caller.
	await flushAfter().catch(() => {});
	return { ...counted, sessionReads };
}

/** What is wrong with how a call by a denied persona went. */
function problemsWhenDenied(persona: Persona, r: Call): string[] {
	const problems: string[] = [];
	// Without a Corps the call may already fail at the tenant lookup.
	if (r.sessionReads === 0 && !persona.noTenantHost) {
		problems.push("never checked the session");
	}
	if (r.writes > 0) {
		problems.push(`wrote ${r.writes}×`);
	}
	const read = tablesOf(r.log).filter((t) => !GUARD_TABLES.has(t));
	if (read.length > 0) {
		problems.push(`read ${read.join(", ")}`);
	}
	const leak = r.result.threw ? null : leakedData(r.result.value);
	if (leak) {
		problems.push(`got ${leak}`);
	}
	return problems.map((p) => `${persona.name}: ${p}`);
}

/** What is wrong with how a call by an allowed persona went. */
function problemsWhenAllowed(persona: Persona, r: Call, access: Access) {
	const problems: string[] = [];
	if (access !== "public" && r.sessionReads === 0) {
		problems.push("never checked the session");
	}
	if (isDenial(r.result)) {
		const v = r.result.value as { message?: string; error?: string } | null;
		problems.push(`was turned away (${v?.message ?? v?.error})`);
	}
	return problems.map((p) => `${persona.name}: ${p}`);
}

// ─── The matrix ─────────────────────────────────────────────────────────────

setupTestDatabases();

const { actions } = scanServerActions();

function entryOf(action: ServerAction): Entry | undefined {
	return MATRIX[action.file]?.[action.name];
}

describe("authorization matrix", () => {
	test("covers every server action, and nothing else", () => {
		const inMatrix = Object.entries(MATRIX).flatMap(([file, fns]) =>
			Object.keys(fns).map((name) => `${file}#${name}`),
		);
		const scanned = actions.map((a) => a.key);
		expect(
			scanned.filter((k) => !inMatrix.includes(k)),
			"server actions without a matrix entry",
		).toEqual([]);
		expect(
			inMatrix.filter((k) => !scanned.includes(k)),
			"matrix entries without a server action",
		).toEqual([]);
	});

	test("public actions are exactly the documented ones", () => {
		const publicInMatrix = actions
			.filter((a) => {
				const entry = entryOf(a);
				const access =
					typeof entry === "object" && "access" in entry ? entry.access : entry;
				return access === "public";
			})
			.map((a) => a.key)
			.sort();
		expect(publicInMatrix).toEqual(Object.keys(PUBLIC_ACTIONS).sort());
	});

	const covered = actions.filter((a) => entryOf(a) !== undefined);

	test.each(covered.map((a) => [a.key, a] as const))(
		"%s",
		async (_key, action) => {
			const entry = entryOf(action) as Entry;
			const { access, args } =
				typeof entry === "object" && "access" in entry
					? entry
					: { access: entry, args: () => [] as unknown[] };

			const home = await createTenant();
			const other = await createTenant();
			const users = new Map<Persona, TestUser | null>();
			for (const persona of PERSONAS) {
				users.set(persona, await persona.setUp(home, other));
			}
			const peer = await createUser({ tenantId: home.id });
			switchTenant(home);

			const mod = (await import(`../${action.file}`)) as Record<
				string,
				(...a: unknown[]) => Promise<unknown>
			>;
			const fn = mod[action.name];
			if (!fn) {
				throw new Error(`${action.key} is not exported`);
			}

			const run = (persona: Persona) => {
				actAs(persona, users.get(persona) ?? null, home);
				return call(fn, args({ other: peer }));
			};
			const problems: string[] = [];

			const before = await rowCounts();
			for (const persona of PERSONAS.filter((p) => !mayCall(access, p))) {
				problems.push(...problemsWhenDenied(persona, await run(persona)));
			}
			switchTenant(home);
			const after = await rowCounts();
			const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
			if (changed.length > 0) {
				problems.push(`denied callers changed ${changed.join(", ")}`);
			}

			for (const persona of PERSONAS.filter((p) => mayCall(access, p))) {
				problems.push(
					...problemsWhenAllowed(persona, await run(persona), access),
				);
			}

			expect(problems).toEqual([]);
		},
		30_000,
	);
});
