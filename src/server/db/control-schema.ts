// control-schema.ts — schema for the control plane DB
//
// Tables here live in a separate Turso DB (env: CONTROL_DATABASE_URL):
//   - Tenant registry, host->tenant mapping, cross-tenant memberships,
//     per-tenant auth config.
//   - Global identity: users (source of truth), accounts, sessions,
//     verifications, passwordResetTokens. Better Auth is bound to this DB.
//
// `users` is mirrored into each tenant DB the user belongs to (so tenant-side
// joins on user keep working). The mirror is updated by Better Auth
// databaseHooks; control-DB row is the source of truth.

import { relations, sql } from "drizzle-orm";
import { index, primaryKey, sqliteTableCreator } from "drizzle-orm/sqlite-core";

export const createControlTable = sqliteTableCreator(
	(name) => `control_${name}`,
);

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
// escalation). Bootstrap via `scripts/grant-superadmin.ts`; further grants
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
// once `migrate-identity.ts` has populated control `users`.
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
