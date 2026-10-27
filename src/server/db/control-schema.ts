// control-schema.ts — schema for the control plane DB
//
// Tables here live in a separate Turso DB (env: CONTROL_DATABASE_URL):
//   - Tenant registry, host->tenant mapping, cross-tenant memberships,
//     per-tenant auth config.
//   - Global identity: users (source of truth), accounts, sessions and
//     verifications. Better Auth is bound to this DB.
//   - Legacy passwordResetTokens retained for migration compatibility.
//
// `users` is mirrored into each tenant DB the user belongs to (so tenant-side
// joins on user keep working). The mirror is updated by Better Auth
// databaseHooks; control-DB row is the source of truth.

import { relations, sql } from "drizzle-orm";
import { index, primaryKey, sqliteTableCreator } from "drizzle-orm/sqlite-core";

export const createControlTable = sqliteTableCreator(
	(name) => `control_${name}`,
);

export type TenantBranding = {
	// Used in bill PDFs / payment instructions.
	paypalUrl?: string;
	billingWebsite?: string;
	// Where the public contact form delivers (fallback: env TOMAIL). Also
	// shown in the public header, footer, Impressum and Datenschutz.
	contactEmail?: string;

	// Public identity (Impressum, Datenschutz, header, footer, SemPro PDF).
	// All optional: a missing value leaves its line out, it is never filled
	// with another Corps' data. Read through `tenant-profile.ts`.
	/** Full name for the Impressum and documents. Fallback: displayName. */
	legalName?: string;
	street?: string;
	/** Postcode and city in one line ("PLZ Ort"). */
	city?: string;
	phone?: string;
	/** Who runs the website, e.g. the Altherrenverein e.V. */
	operator?: string;
	/** Vertretungsberechtigte Person(en) of the operator. */
	representative?: string;
	instagramUrl?: string;
	wikipediaUrl?: string;
	/** Founding day as "MM-DD" (Gründungstag achievement). None hides it. */
	foundingDay?: string;
	sempro?: TenantSemproBranding;
	// Future: logo URL, primary color.
};

/** The printed semester programme (SemPro PDF). */
export type TenantSemproBranding = {
	/** Short name in the letterhead. Fallback: displayName. */
	name?: string;
	/** Cover text; "{semester}" is replaced, "\n" breaks lines. */
	intro?: string;
	/** Letterhead lines. Fallback: street, city, phone, contactEmail. */
	contactLines?: string[];
	/** Name of the regular Stammtisch. Fallback: "Stammtisch". */
	stammtischName?: string;
	/** Coat of arms, a PNG file name in `public/sempro/`. None: no image. */
	logoFile?: string;
};

export const tenants = createControlTable("tenant", (d) => ({
	id: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	slug: d.text({ length: 100 }).notNull().unique(),
	displayName: d.text({ length: 255 }).notNull(),
	status: d
		.text({ enum: ["active", "suspended", "pending"] })
		.notNull()
		.default("active"),
	dbUrl: d.text().notNull(),
	dbAuthToken: d.text(),
	branding: d.text({ mode: "json" }).$type<TenantBranding>(),
	// Bumped (to the current maximum + 1) by every write that changes what
	// the tenant-config service caches: status, domains, flags, auth config,
	// name, DB credentials. Instances compare `max(configVersion)` and the
	// tenant count to notice changes made elsewhere (see tenant-config.ts).
	configVersion: d.integer().notNull().default(0),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date()),
}));

// ─── Tenant provisioning ──────────────────────────────────────────────────────
//
// One row per provisioning run, keyed by slug. `step` is the last step that
// completed; a failed or interrupted run is resumed from the next one (see
// tenant-provisioning.ts). The row stays behind as a record once `active`.

export const PROVISIONING_STEPS = [
	"requested",
	"db_requested",
	"db_created",
	"token",
	"migrated",
	"seeded",
	"control_rows",
	"domain",
	"first_admin",
	"active",
] as const;
export type ProvisioningStep = (typeof PROVISIONING_STEPS)[number];

export const tenantProvisioning = createControlTable(
	"tenant_provisioning",
	(d) => ({
		slug: d.text({ length: 100 }).notNull().primaryKey(),
		displayName: d.text({ length: 255 }).notNull(),
		dbName: d.text({ length: 64 }).notNull(),
		primaryHostname: d.text({ length: 255 }),
		firstAdminEmail: d.text({ length: 255 }),
		step: d.text({ enum: PROVISIONING_STEPS }).notNull().default("requested"),
		dbUrl: d.text(),
		// Held only until the tenant is active; the tenant row keeps its own copy.
		dbAuthToken: d.text(),
		tenantId: d.text({ length: 255 }),
		lastError: d.text(),
		attempts: d.integer().notNull().default(0),
		// A run holds the lease while it works, so two clicks cannot race.
		leaseUntil: d.integer({ mode: "timestamp" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
		completedAt: d.integer({ mode: "timestamp" }),
	}),
);

export const tenantDomains = createControlTable(
	"tenant_domain",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		tenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		hostname: d.text({ length: 255 }).notNull().unique(),
		isPrimary: d.integer({ mode: "boolean" }).notNull().default(false),
		isCustom: d.integer({ mode: "boolean" }).notNull().default(true),
		verifiedAt: d.integer({ mode: "timestamp" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	}),
	(t) => [index("tenant_domain_tenant_idx").on(t.tenantId)],
);

export const tenantAuthConfig = createControlTable(
	"tenant_auth_config",
	(d) => ({
		tenantId: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.references(() => tenants.id, { onDelete: "cascade" }),
		emailPasswordEnabled: d
			.integer({ mode: "boolean" })
			.notNull()
			.default(true),
		microsoftEnabled: d.integer({ mode: "boolean" }).notNull().default(false),
		azureClientId: d.text({ length: 255 }),
		azureClientSecret: d.text(),
		azureTenantId: d.text({ length: 255 }),
		// Mailbox the app sends as via Microsoft Graph (/users/{sender}/sendMail,
		// client-credentials + Mail.Send application permission). Null → tenant
		// mail falls back to the legacy Gmail transport.
		mailSenderEmail: d.text({ length: 255 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	}),
);

// ─── Identity (Better Auth) ───────────────────────────────────────────────────

export const users = createControlTable("user", (d) => ({
	id: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: d.text({ length: 255 }),
	email: d.text({ length: 255 }).notNull().unique(),
	emailVerified: d.integer({ mode: "boolean" }).notNull().default(false),
	image: d.text({ length: 255 }),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date()),
}));

export const accounts = createControlTable(
	"account",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		accountId: d.text({ length: 255 }).notNull(),
		providerId: d.text({ length: 255 }).notNull(),
		userId: d
			.text({ length: 255 })
			.notNull()
			.references(() => users.id),
		accessToken: d.text(),
		refreshToken: d.text(),
		idToken: d.text(),
		accessTokenExpiresAt: d.integer({ mode: "timestamp" }),
		refreshTokenExpiresAt: d.integer({ mode: "timestamp" }),
		scope: d.text({ length: 255 }),
		password: d.text({ length: 255 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	}),
	(t) => [index("account_user_id_idx").on(t.userId)],
);

export const sessions = createControlTable(
	"session",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		expiresAt: d.integer({ mode: "timestamp" }).notNull(),
		token: d.text({ length: 255 }).notNull().unique(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
		ipAddress: d.text({ length: 255 }),
		userAgent: d.text({ length: 255 }),
		userId: d
			.text({ length: 255 })
			.notNull()
			.references(() => users.id),
	}),
	(t) => [index("session_userId_idx").on(t.userId)],
);

export const verifications = createControlTable("verification", (d) => ({
	id: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	identifier: d.text({ length: 255 }).notNull(),
	value: d.text({ length: 255 }).notNull(),
	expiresAt: d.integer({ mode: "timestamp" }).notNull(),
	createdAt: d.integer({ mode: "timestamp" }).$defaultFn(() => new Date()),
	updatedAt: d
		.integer({ mode: "timestamp" })
		.$defaultFn(() => new Date())
		.$onUpdate(() => new Date()),
}));

// Legacy custom reset table. New resets use Better Auth's `verifications`
// table; keep this definition until old installations no longer need migration.
export const passwordResetTokens = createControlTable(
	"password_reset_token",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		email: d.text({ length: 255 }).notNull(),
		token: d.text({ length: 255 }).notNull().unique(),
		expires: d.integer({ mode: "timestamp" }).notNull(),
		createdAt: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
	}),
	(t) => [
		index("password_reset_email_idx").on(t.email),
		index("password_reset_token_idx").on(t.token),
	],
);

// Platform-level superadmins (operators of the SaaS). Stored as a separate
// table — NOT a flag on `users` — so user-update code paths physically cannot
// grant superadmin (defense-in-depth against mass-assignment privilege
// escalation). Bootstrap via `scripts/ops/grant-superadmin.ts`; further grants
// only via the superadmin UI.
export const superAdmins = createControlTable("super_admin", (d) => ({
	userId: d.text({ length: 255 }).notNull().primaryKey(),
	grantedAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	grantedBy: d.text({ length: 255 }),
	reason: d.text({ length: 500 }),
}));

// `tenantMemberships.userId` is a logical reference to `users.id`. The FK is
// intentionally omitted so this migration can run without ordering hazards
// against the existing memberships seeded in step 1 (which were inserted
// before control-DB users existed). Add the FK in a later cleanup migration
// once `migrate-identity.ts` (one-off, removed) has populated control `users`.
export const tenantMemberships = createControlTable(
	"tenant_membership",
	(d) => ({
		userId: d.text({ length: 255 }).notNull(),
		tenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		status: d
			.text({ enum: ["active", "suspended", "pending"] })
			.notNull()
			.default("active"),
		joinedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	}),
	(t) => [
		primaryKey({ columns: [t.userId, t.tenantId] }),
		index("tenant_membership_user_idx").on(t.userId),
		index("tenant_membership_tenant_idx").on(t.tenantId),
	],
);

// ─── Unified ELO (one stats row per user across all Corps) ──────────────────
//
// Single source of truth for every user's ELO + games/wins/losses. Updated by:
//   - intra-Corps games (settleChallenge in tenant DB writes here, not tenant userStats)
//   - cross-Corps games (settleCrossTenantChallenge below)
//
// Internal leaderboard = filter to current tenant's members.
// External leaderboard = no filter.
export const userStats = createControlTable(
	"user_stat",
	(d) => ({
		userId: d.text({ length: 255 }).notNull().primaryKey(),
		currentElo: d.integer().notNull().default(1200),
		totalGames: d.integer().notNull().default(0),
		wins: d.integer().notNull().default(0),
		losses: d.integer().notNull().default(0),
		peakElo: d.integer().notNull().default(1200),
		lastGameAt: d.integer({ mode: "timestamp" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
	}),
	(t) => [index("user_stat_elo_idx").on(t.currentElo)],
);

export const crossTenantChallenges = createControlTable(
	"cross_tenant_challenge",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		challengerId: d.text({ length: 255 }).notNull(),
		challengerTenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		opponentId: d.text({ length: 255 }).notNull(),
		opponentTenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		status: d
			.text({
				enum: [
					"pending",
					"accepted",
					"result_proposed",
					"confirmed",
					"settled",
					"declined",
					"expired",
					"cancelled",
					"disputed",
				],
			})
			.notNull()
			.default("pending"),
		// `none` = no auto-order, settled offline. Cross-Corps default.
		payment: d
			.text({ enum: ["none", "challenger", "loser", "split"] })
			.notNull()
			.default("none"),
		drinkName: d.text({ length: 255 }),
		quantity: d.integer().notNull().default(2),
		proposedWinnerId: d.text({ length: 255 }),
		proposedById: d.text({ length: 255 }),
		proposedAt: d.integer({ mode: "timestamp" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		acceptedAt: d.integer({ mode: "timestamp" }),
		declinedAt: d.integer({ mode: "timestamp" }),
		respondDeadline: d.integer({ mode: "timestamp" }).notNull(),
		playDeadline: d.integer({ mode: "timestamp" }),
		confirmDeadline: d.integer({ mode: "timestamp" }),
		gameId: d.text({ length: 255 }),
	}),
	(t) => [
		index("cross_challenge_challenger_idx").on(t.challengerId, t.status),
		index("cross_challenge_opponent_idx").on(t.opponentId, t.status),
		index("cross_challenge_status_idx").on(t.status),
		index("cross_challenge_created_idx").on(t.createdAt),
	],
);

export const crossTenantGames = createControlTable(
	"cross_tenant_game",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		player1Id: d.text({ length: 255 }).notNull(),
		player1TenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		player2Id: d.text({ length: 255 }).notNull(),
		player2TenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		winnerId: d.text({ length: 255 }).notNull(),
		playedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		player1EloBefore: d.integer().notNull().default(1200),
		player2EloBefore: d.integer().notNull().default(1200),
		player1EloAfter: d.integer().notNull().default(1200),
		player2EloAfter: d.integer().notNull().default(1200),
		challengeId: d.text({ length: 255 }),
		gameType: d.text({ length: 50 }).default("bierjunge"),
	}),
	(t) => [
		index("cross_game_player1_idx").on(t.player1Id),
		index("cross_game_player2_idx").on(t.player2Id),
		index("cross_game_played_idx").on(t.playedAt),
	],
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
	sessions: many(sessions),
	memberships: many(tenantMemberships),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// Per-tenant feature flags. A missing row means the flag is off; keys are
// validated against the registry in `~/lib/features`. Lives in the control DB
// so a superadmin decides which Corps gets which feature, with one migration
// for all tenants.
export const tenantFeatures = createControlTable(
	"tenant_feature",
	(d) => ({
		tenantId: d
			.text({ length: 255 })
			.notNull()
			.references(() => tenants.id, { onDelete: "cascade" }),
		key: d.text({ length: 100 }).notNull(),
		enabled: d.integer({ mode: "boolean" }).notNull().default(false),
		updatedAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date())
			.$onUpdate(() => new Date()),
		updatedBy: d.text({ length: 255 }),
	}),
	(t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const tenantMembershipsRelations = relations(
	tenantMemberships,
	({ one }) => ({
		user: one(users, {
			fields: [tenantMemberships.userId],
			references: [users.id],
		}),
		tenant: one(tenants, {
			fields: [tenantMemberships.tenantId],
			references: [tenants.id],
		}),
	}),
);

export type Tenant = typeof tenants.$inferSelect;
export type TenantDomain = typeof tenantDomains.$inferSelect;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type TenantAuthConfig = typeof tenantAuthConfig.$inferSelect;
export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type SuperAdmin = typeof superAdmins.$inferSelect;
export type TenantFeature = typeof tenantFeatures.$inferSelect;
