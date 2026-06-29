// schema.ts

import { relations, sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	primaryKey,
	sqliteTableCreator,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// No prefix — each tenant has its own DB so per-tenant namespacing is
// implicit. The legacy `rhenania_` prefix on the existing tenant DB is
// stripped by `scripts/apply-prefix-rename.ts`.
export const createTable = sqliteTableCreator((name) => name);

// MIRROR of control-DB `users` (source of truth lives in control DB).
// Kept here so tenant-DB joins on user keep working. Sync is driven by
// Better Auth databaseHooks in `~/server/auth/index.ts`.
export const users = createTable("user", (d) => ({
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

export const roles = createTable("role", (d) => ({
	id: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: d.text({ length: 50 }).notNull().unique(),
	description: d.text({ length: 255 }),
	createdAt: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
	updatedAt: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
}));

export const userRoles = createTable(
	"user_role",
	(d) => ({
		userId: d
			.text({ length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		roleId: d
			.text({ length: 255 })
			.notNull()
			.references(() => roles.id, { onDelete: "cascade" }),
		assignedAt: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
		assignedBy: d.text({ length: 255 }),
	}),
	(t) => [
		primaryKey({ columns: [t.userId, t.roleId] }),
		index("user_roles_user_id_idx").on(t.userId),
		index("user_roles_role_id_idx").on(t.roleId),
	],
);

export const usersRelations = relations(users, ({ many }) => ({
	userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
	userRoles: many(userRoles),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
	user: one(users, { fields: [userRoles.userId], references: [users.id] }),
	role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const userPreferences = createTable(
	"user_preference",
	(d) => ({
		userId: d
			.text({ length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		key: d.text({ length: 100 }).notNull(),
		value: d.text().notNull(),
		valueType: d
			.text({ enum: ["boolean", "number", "string", "json"] })
			.notNull()
			.default("json"),
		createdAt: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
		updatedAt: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
	}),
	(t) => [
		primaryKey({ columns: [t.userId, t.key] }),
		index("user_pref_user_idx").on(t.userId),
		index("user_pref_key_idx").on(t.key),
	],
);

export const userPreferencesRelations = relations(
	userPreferences,
	({ one }) => ({
		user: one(users, {
			fields: [userPreferences.userId],
			references: [users.id],
		}),
	}),
);

// `accounts`, `sessions`, `verifications`, `passwordResetTokens` were moved
// to the control DB (see `~/server/db/control-schema.ts`). Better Auth and
// password-reset / OAuth-token logic now go through `controlDb`.

// Custom invitation tokens (admin creates user → sends email → user activates).
// Stays in tenant DB because invitations are tenant-scoped.
export const verificationTokens = createTable(
	"verification_token",
	(d) => ({
		identifier: d.text({ length: 255 }).notNull(),
		token: d.text({ length: 255 }).notNull(),
		expires: d.integer({ mode: "timestamp" }).notNull(),
	}),
	(t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const drinks = createTable(
	"drink",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: d.text({ length: 255 }).notNull(),
		price: d.real().notNull(),
		kastengroesse: d.integer(),
		volume: d.real(),
		picture: d.text(),
		isCurrentlyAvailable: d
			.integer({ mode: "boolean" })
			.notNull()
			.default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("drink_name_idx").on(t.name),
		index("drink_available_idx").on(t.isCurrentlyAvailable),
	],
);

export const orders = createTable(
	"order",
	(o) => ({
		id: o
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: o.text({ length: 255 }).notNull(),
		userName: o.text({ length: 255 }).notNull(),
		drinkId: o.text({ length: 255 }).notNull(),
		drinkName: o.text({ length: 255 }).notNull(),
		amount: o.integer().notNull(),
		pricePerUnit: o.real().notNull(),
		total: o.real().notNull(),
		inBill: o.integer({ mode: "boolean" }).notNull().default(false),
		bookingFor: o.text({ length: 255 }),
		bookedByAdminId: o.text({ length: 255 }),
		bookedByAdminName: o.text({ length: 255 }),
		createdAt: o
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: o.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("order_user_idx").on(t.userId),
		index("order_drink_idx").on(t.drinkId),
		index("order_created_idx").on(t.createdAt),
		foreignKey({
			columns: [t.drinkId],
			foreignColumns: [drinks.id],
			name: "order_drink_fk",
		}),
	],
);

export const billPeriods = createTable(
	"bill_period",
	(bp) => ({
		id: bp
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		billNumber: bp.text().notNull().unique(),
		totalAmount: bp.real().notNull().default(0),
		createdAt: bp
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		createdBy: bp.text({ length: 255 }),
		updatedAt: bp.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
		closedAt: bp.integer({ mode: "timestamp" }),
	}),
	(t) => [
		index("bill_period_number_idx").on(t.billNumber),
		index("bill_period_dates_idx").on(t.createdAt),
	],
);

export const bills = createTable(
	"bill",
	(b) => ({
		id: b
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		billPeriodId: b.text({ length: 255 }).notNull(),
		userId: b.text({ length: 255 }).notNull(),
		userName: b.text({ length: 255 }).notNull(),
		status: b
			.text({
				enum: ["Bezahlt", "Unbezahlt", "Gestundet"],
			})
			.notNull()
			.default("Unbezahlt"),
		oldBillingAmount: b.real().notNull().default(0),
		fees: b.real().notNull().default(0),
		umlage: b.real().notNull().default(0),
		drinksTotal: b.real().notNull(),
		total: b.real().notNull(),
		createdAt: b
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: b.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
		paidAt: b.integer({ mode: "timestamp" }),
	}),
	(t) => [
		index("bill_period_idx").on(t.billPeriodId),
		index("bill_user_idx").on(t.userId),
		index("bill_status_idx").on(t.status),
		index("bill_created_idx").on(t.createdAt),
		foreignKey({
			columns: [t.billPeriodId],
			foreignColumns: [billPeriods.id],
			name: "bill_period_fk",
		}),
	],
);

export const billItems = createTable(
	"bill_item",
	(bi) => ({
		id: bi
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		billId: bi.text({ length: 255 }).notNull(),
		drinkName: bi.text({ length: 255 }).notNull(),
		amount: bi.integer().notNull(),
		pricePerDrink: bi.real().notNull(),
		totalPricePerDrink: bi.real().notNull(),
		createdAt: bi
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	}),
	(t) => [
		index("bill_item_bill_idx").on(t.billId),
		index("bill_item_drink_idx").on(t.drinkName),
		foreignKey({
			columns: [t.billId],
			foreignColumns: [bills.id],
			name: "bill_item_bill_fk",
		}).onDelete("cascade"),
	],
);

export const billsRelations = {
	billPeriod: {
		relation: "many-to-one",
		target: billPeriods,
		fields: [bills.billPeriodId],
		references: [billPeriods.id],
	},
	items: {
		relation: "one-to-many",
		target: billItems,
		fields: [bills.id],
		references: [billItems.billId],
	},
};

export const billItemsRelations = {
	bill: {
		relation: "many-to-one",
		target: bills,
		fields: [billItems.billId],
		references: [bills.id],
	},
};

export const games = createTable("game", (d) => ({
	id: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	player1Id: d
		.text({ length: 255 })
		.notNull()
		.references(() => users.id),
	player2Id: d
		.text({ length: 255 })
		.notNull()
		.references(() => users.id),
	winnerId: d
		.text({ length: 255 })
		.notNull()
		.references(() => users.id),
	playedAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	player1EloBefore: d.integer().default(1200),
	player2EloBefore: d.integer().default(1200),
	player1EloAfter: d.integer().default(1200),
	player2EloAfter: d.integer().default(1200),
	orderId: d.text({ length: 255 }),
	challengeId: d.text({ length: 255 }),
	gameType: d.text({ length: 50 }).default("bierjunge"),
}));

export const challenges = createTable(
	"challenge",
	(c) => ({
		id: c
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		challengerId: c
			.text({ length: 255 })
			.notNull()
			.references(() => users.id),
		opponentId: c
			.text({ length: 255 })
			.notNull()
			.references(() => users.id),
		status: c
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
		payment: c
			.text({ enum: ["challenger", "loser", "split"] })
			.notNull()
			.default("challenger"),
		drinkId: c
			.text({ length: 255 })
			.notNull()
			.references(() => drinks.id),
		quantity: c.integer().notNull().default(2),
		proposedWinnerId: c.text({ length: 255 }).references(() => users.id),
		proposedById: c.text({ length: 255 }).references(() => users.id),
		proposedAt: c.integer({ mode: "timestamp" }),
		createdAt: c
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		acceptedAt: c.integer({ mode: "timestamp" }),
		declinedAt: c.integer({ mode: "timestamp" }),
		respondDeadline: c.integer({ mode: "timestamp" }).notNull(),
		playDeadline: c.integer({ mode: "timestamp" }),
		confirmDeadline: c.integer({ mode: "timestamp" }),
		gameId: c.text({ length: 255 }),
	}),
	(t) => [
		index("challenge_challenger_status_idx").on(t.challengerId, t.status),
		index("challenge_opponent_status_idx").on(t.opponentId, t.status),
		index("challenge_status_idx").on(t.status),
		index("challenge_created_idx").on(t.createdAt),
	],
);

// `userStats` was moved to the control DB so that a user with memberships in
// multiple Corps has a single ELO across all of them. Imports of `userStats`
// must come from `~/server/db/control-schema` now.

export const billCSVs = createTable(
	"bill_csv",
	(bc) => ({
		id: bc
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		billPeriodId: bc.text({ length: 255 }).notNull(),
		blobUrl: bc.text().notNull(),
		fileName: bc.text({ length: 255 }).notNull(),
		delimiter: bc.text({ length: 10 }).notNull().default("\t"),
		fileSize: bc.integer(),
		createdAt: bc
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	}),
	(t) => [
		index("bill_csv_period_idx").on(t.billPeriodId),
		index("bill_csv_created_idx").on(t.createdAt),
		foreignKey({
			columns: [t.billPeriodId],
			foreignColumns: [billPeriods.id],
			name: "bill_csv_period_fk",
		}).onDelete("cascade"),
	],
);

export const billCSVsRelations = {
	billPeriod: {
		relation: "many-to-one",
		target: billPeriods,
		fields: [billCSVs.billPeriodId],
		references: [billPeriods.id],
	},
};

export const billPeriodsRelations = {
	bills: {
		relation: "one-to-many",
		target: bills,
		fields: [billPeriods.id],
		references: [bills.billPeriodId],
	},
	csvs: {
		relation: "one-to-many",
		target: billCSVs,
		fields: [billPeriods.id],
		references: [billCSVs.billPeriodId],
	},
};

export const billPDFs = createTable(
	"bill_pdf",
	(bp) => ({
		id: bp
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		billId: bp.text({ length: 255 }).notNull(),
		userId: bp.text({ length: 255 }).notNull(),
		blobUrl: bp.text().notNull(),
		fileName: bp.text().notNull(),
		fileSize: bp.integer().notNull(),
		createdAt: bp
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	}),
	(t) => [
		index("bill_pdf_bill_idx").on(t.billId),
		index("bill_pdf_user_idx").on(t.userId),
		uniqueIndex("bill_pdf_unique_idx").on(t.billId),
		foreignKey({
			columns: [t.billId],
			foreignColumns: [bills.id],
			name: "bill_pdf_bill_fk",
		}),
	],
);

export const homepageImages = createTable(
	"homepage_image",
	(h) => ({
		id: h
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		// Logical reference to homepageSections.key — validation lives in the
		// admin UI, not as a SQLite CHECK / FK (kept as plain text so per-tenant
		// configurable section keys work without DDL changes).
		section: h.text({ length: 100 }).notNull(),
		imageUrl: h.text().notNull(),
		imageName: h.text({ length: 255 }).notNull(),
		fileSize: h.integer(),
		mimeType: h.text({ length: 50 }),
		displayOrder: h.integer().notNull().default(0),
		isActive: h.integer({ mode: "boolean" }).notNull().default(true),
		uploadedBy: h.text({ length: 255 }).references(() => users.id),
		createdAt: h
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: h.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("homepage_image_section_idx").on(t.section),
		index("homepage_image_active_idx").on(t.isActive),
		index("homepage_image_order_idx").on(t.displayOrder),
		index("homepage_image_section_active_idx").on(t.section, t.isActive),
	],
);

export const homepageImagesRelations = relations(homepageImages, ({ one }) => ({
	uploadedBy: one(users, {
		fields: [homepageImages.uploadedBy],
		references: [users.id],
	}),
}));

export const inventories = createTable(
	"inventory",
	(i) => ({
		id: i
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		status: i
			.text({
				enum: ["active", "closed"],
			})
			.notNull()
			.default("active"),
		totalLoss: i.real().notNull().default(0),
		performedBy: i.text({ length: 255 }).references(() => users.id),
		createdAt: i
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		closedAt: i.integer({ mode: "timestamp" }),
	}),
	(t) => [index("inventory_status_idx").on(t.status)],
);

export const inventoryItems = createTable(
	"inventory_item",
	(ii) => ({
		id: ii
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		inventoryId: ii
			.text({ length: 255 })
			.notNull()
			.references(() => inventories.id, { onDelete: "cascade" }),
		drinkId: ii
			.text({ length: 255 })
			.notNull()
			.references(() => drinks.id),
		countedStock: ii.integer().notNull(),
		previousStock: ii.integer().notNull().default(0),
		purchasedSince: ii.integer().notNull().default(0),
		soldSince: ii.integer().notNull().default(0),
		priceAtCount: ii.real().notNull(),
		lossValue: ii.real().notNull().default(0),
	}),
	(t) => [
		index("inventory_item_inventory_idx").on(t.inventoryId),
		index("inventory_item_drink_idx").on(t.drinkId),
		uniqueIndex("inventory_item_unique_idx").on(t.inventoryId, t.drinkId),
	],
);

export const inventoriesRelations = relations(inventories, ({ one, many }) => ({
	performedBy: one(users, {
		fields: [inventories.performedBy],
		references: [users.id],
	}),
	items: many(inventoryItems),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
	inventory: one(inventories, {
		fields: [inventoryItems.inventoryId],
		references: [inventories.id],
	}),
	drink: one(drinks, {
		fields: [inventoryItems.drinkId],
		references: [drinks.id],
	}),
}));

export const drinksRelations = relations(drinks, ({ many }) => ({
	orders: many(orders),
	inventoryItems: many(inventoryItems),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
	drink: one(drinks, {
		fields: [orders.drinkId],
		references: [drinks.id],
	}),
	user: one(users, {
		fields: [orders.userId],
		references: [users.id],
	}),
}));

export const achievements = createTable(
	"achievement",
	(a) => ({
		id: a
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		key: a.text({ length: 100 }).notNull().unique(),
		name: a.text({ length: 255 }).notNull(),
		description: a.text({ length: 500 }).notNull(),
		category: a
			.text({
				enum: ["drinking", "games", "social", "financial", "time", "special"],
			})
			.notNull(),
		icon: a.text({ length: 100 }),
		targetValue: a.integer(),
		isSecret: a.integer({ mode: "boolean" }).notNull().default(false),
		points: a.integer().notNull().default(10),
		rarity: a
			.text({
				enum: ["common", "uncommon", "rare", "epic", "legendary"],
			})
			.notNull()
			.default("common"),
		isActive: a.integer({ mode: "boolean" }).notNull().default(true),
		createdAt: a
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: a.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("achievement_category_idx").on(t.category),
		index("achievement_active_idx").on(t.isActive),
		index("achievement_rarity_idx").on(t.rarity),
	],
);

export const userAchievements = createTable(
	"user_achievement",
	(ua) => ({
		id: ua
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: ua
			.text({ length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		achievementId: ua
			.text({ length: 255 })
			.notNull()
			.references(() => achievements.id, { onDelete: "cascade" }),
		unlockedAt: ua
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		progress: ua.integer().notNull().default(0),
		notificationSent: ua.integer({ mode: "boolean" }).notNull().default(false),
	}),
	(t) => [
		uniqueIndex("user_achievement_unique_idx").on(t.userId, t.achievementId),
		index("user_achievement_user_idx").on(t.userId),
		index("user_achievement_achievement_idx").on(t.achievementId),
		index("user_achievement_unlocked_idx").on(t.unlockedAt),
	],
);

export const achievementProgress = createTable(
	"achievement_progress",
	(ap) => ({
		id: ap
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: ap
			.text({ length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		achievementId: ap
			.text({ length: 255 })
			.notNull()
			.references(() => achievements.id, { onDelete: "cascade" }),
		currentValue: ap.integer().notNull().default(0),
		metadata: ap.text(),
		lastUpdated: ap
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	}),
	(t) => [
		uniqueIndex("achievement_progress_unique_idx").on(
			t.userId,
			t.achievementId,
		),
		index("achievement_progress_user_idx").on(t.userId),
		index("achievement_progress_achievement_idx").on(t.achievementId),
	],
);

export const achievementsRelations = relations(achievements, ({ many }) => ({
	userAchievements: many(userAchievements),
	progress: many(achievementProgress),
}));

export const userAchievementsRelations = relations(
	userAchievements,
	({ one }) => ({
		user: one(users, {
			fields: [userAchievements.userId],
			references: [users.id],
		}),
		achievement: one(achievements, {
			fields: [userAchievements.achievementId],
			references: [achievements.id],
		}),
	}),
);

export const achievementProgressRelations = relations(
	achievementProgress,
	({ one }) => ({
		user: one(users, {
			fields: [achievementProgress.userId],
			references: [users.id],
		}),
		achievement: one(achievements, {
			fields: [achievementProgress.achievementId],
			references: [achievements.id],
		}),
	}),
);

export const recurringEvents = createTable(
	"recurring_event",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		title: d.text({ length: 255 }).notNull(),
		description: d.text({ length: 1000 }),
		location: d.text({ length: 255 }).default("adH Rhenania"),
		// Logical reference to eventTypes.key — see homepageSections comment.
		type: d.text({ length: 100 }).notNull().default("Sonstige"),
		// biweekly | monthly_1st_wednesday | monthly_1st_3rd_wednesday | occ_semester
		recurrenceType: d
			.text({
				enum: [
					"biweekly",
					"monthly_1st_wednesday",
					"monthly_1st_3rd_wednesday",
					"occ_semester",
				],
			})
			.notNull(),
		// 0=Sun 1=Mon ... 6=Sat — used for biweekly
		dayOfWeek: d.integer(),
		// HH:MM e.g. "18:00"
		time: d.text({ length: 5 }).notNull().default("20:00"),
		isPublic: d.integer({ mode: "boolean" }).notNull().default(true),
		meetingUrl: d.text({ length: 2048 }),
		// Semester bounds — generation is clamped to this range
		startDate: d.integer({ mode: "timestamp" }),
		endDate: d.integer({ mode: "timestamp" }),
		isActive: d.integer({ mode: "boolean" }).notNull().default(true),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("recurring_event_type_idx").on(t.type),
		index("recurring_event_active_idx").on(t.isActive),
	],
);

export const recurringEventsRelations = relations(
	recurringEvents,
	({ one, many }) => ({
		createdBy: one(users, {
			fields: [recurringEvents.createdBy],
			references: [users.id],
		}),
		instances: many(events),
	}),
);

export const events = createTable(
	"event",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		title: d.text({ length: 255 }).notNull(),
		description: d.text({ length: 1000 }),
		date: d.integer({ mode: "timestamp" }).notNull(),
		endDate: d.integer({ mode: "timestamp" }),
		location: d.text({ length: 255 }),
		// Logical reference to eventTypes.key — see homepageSections comment.
		type: d.text({ length: 100 }).notNull().default("Sonstige"),
		isPublic: d.integer({ mode: "boolean" }).notNull().default(true),
		isCancelled: d.integer({ mode: "boolean" }).notNull().default(false),
		meetingUrl: d.text({ length: 2048 }),
		rsvpDeadline: d.integer({ mode: "timestamp" }),
		maxAttendees: d.integer(),
		recurringEventId: d
			.text({ length: 255 })
			.references(() => recurringEvents.id, { onDelete: "set null" }),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("event_date_idx").on(t.date),
		index("event_type_idx").on(t.type),
		index("event_public_idx").on(t.isPublic),
		index("event_recurring_idx").on(t.recurringEventId),
	],
);

export const eventsRelations = relations(events, ({ one, many }) => ({
	createdBy: one(users, {
		fields: [events.createdBy],
		references: [users.id],
	}),
	recurringEvent: one(recurringEvents, {
		fields: [events.recurringEventId],
		references: [recurringEvents.id],
	}),
	rsvps: many(eventRsvps),
}));

export const eventRsvps = createTable(
	"event_rsvp",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		eventId: d
			.text({ length: 255 })
			.notNull()
			.references(() => events.id, { onDelete: "cascade" }),
		userId: d
			.text({ length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		status: d.text({ enum: ["yes", "no", "maybe"] }).notNull(),
		note: d.text({ length: 500 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		uniqueIndex("event_rsvp_unique_idx").on(t.eventId, t.userId),
		index("event_rsvp_event_idx").on(t.eventId),
		index("event_rsvp_user_idx").on(t.userId),
	],
);

export const eventRsvpsRelations = relations(eventRsvps, ({ one }) => ({
	event: one(events, {
		fields: [eventRsvps.eventId],
		references: [events.id],
	}),
	user: one(users, {
		fields: [eventRsvps.userId],
		references: [users.id],
	}),
}));

export const calendarTokens = createTable(
	"calendar_token",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: d
			.text({ length: 255 })
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		token: d.text({ length: 255 }).notNull().unique(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		lastUsedAt: d.integer({ mode: "timestamp" }),
	}),
	(t) => [
		index("calendar_token_user_idx").on(t.userId),
		index("calendar_token_token_idx").on(t.token),
	],
);

export const calendarTokensRelations = relations(calendarTokens, ({ one }) => ({
	user: one(users, {
		fields: [calendarTokens.userId],
		references: [users.id],
	}),
}));

export const venues = createTable(
	"venue",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		shortName: d.text({ length: 255 }).notNull().unique(),
		fullAddress: d.text({ length: 500 }).notNull(),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	}),
	(t) => [uniqueIndex("venue_short_name_idx").on(t.shortName)],
);

// ─── Getränkewart / Kasse ─────────────────────────────────────────────────────

export const bankEntries = createTable(
	"bank_entry",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		amount: d.real().notNull(), // positive = Einzahlung, negative = Ausgabe
		description: d.text({ length: 500 }).notNull(),
		date: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	}),
	(t) => [
		index("bank_entry_date_idx").on(t.date),
		index("bank_entry_created_idx").on(t.createdAt),
	],
);

export const externalBills = createTable(
	"external_bill",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		creditor: d.text({ length: 255 }).notNull(),
		description: d.text({ length: 500 }).notNull(),
		amount: d.real().notNull(),
		status: d
			.text({ enum: ["Offen", "Bezahlt"] })
			.notNull()
			.default("Offen"),
		paidAt: d.integer({ mode: "timestamp" }),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("external_bill_status_idx").on(t.status),
		index("external_bill_created_idx").on(t.createdAt),
	],
);

// Singleton config row for Kasse (pfand value etc.)
export const kasseConfig = createTable("kasse_config", (d) => ({
	id: d.text({ length: 50 }).notNull().primaryKey().default("singleton"),
	pfandWert: d.real().notNull().default(0),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	updatedBy: d
		.text({ length: 255 })
		.references(() => users.id, { onDelete: "set null" }),
}));

// ─── Semester Config ──────────────────────────────────────────────────────────
export const semesterConfig = createTable("semester_config", (d) => ({
	id: d.text({ length: 50 }).notNull().primaryKey().default("singleton"),
	name: d.text({ length: 255 }).notNull().default(""),
	startDate: d.integer({ mode: "timestamp" }),
	endDate: d.integer({ mode: "timestamp" }),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

// ─── Corps Konten ─────────────────────────────────────────────────────────────
export const kontos = createTable(
	"konto",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		// Logical reference to kasseTypes.key — see homepageSections comment.
		kasseType: d.text({ length: 100 }).notNull(),
		iban: d.text({ length: 50 }).notNull(),
		bic: d.text({ length: 20 }).notNull(),
		bankName: d.text({ length: 255 }).notNull(),
		description: d.text({ length: 500 }),
		isActive: d.integer({ mode: "boolean" }).notNull().default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [index("konto_type_idx").on(t.kasseType)],
);

// ─── Per-tenant configurable enums ────────────────────────────────────────────
//
// These tables replace the hard-coded SQLite text-enum constraints that were
// previously baked into kontos.kasseType, events.type, recurringEvents.type,
// and homepageImages.section. Each tenant now defines its own valid keys so
// non-Rhenania Corps can rename, add, or remove categories without code
// changes. `key` is the value stored in the referencing column.

export const kasseTypes = createTable(
	"kasse_type",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		key: d.text({ length: 100 }).notNull().unique(),
		label: d.text({ length: 255 }).notNull(),
		displayOrder: d.integer().notNull().default(0),
		isActive: d.integer({ mode: "boolean" }).notNull().default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	}),
	(t) => [index("kasse_type_active_idx").on(t.isActive)],
);

export const eventTypes = createTable(
	"event_type",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		key: d.text({ length: 100 }).notNull().unique(),
		label: d.text({ length: 255 }).notNull(),
		displayOrder: d.integer().notNull().default(0),
		isActive: d.integer({ mode: "boolean" }).notNull().default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	}),
	(t) => [index("event_type_active_idx").on(t.isActive)],
);

// ─── Fuchsenladen ─────────────────────────────────────────────────────────────
//
// Parallel to the drinks shop (drinks/orders) but for Fuchsen-specific items
// (sweets, snacks, etc.). Bill tracking is per-order: each order carries a
// "Offen" / "Bezahlt" status the Fuchsenwart can flip.

export const fuchsenItems = createTable(
	"fuchsen_item",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: d.text({ length: 255 }).notNull(),
		price: d.real().notNull(),
		description: d.text({ length: 500 }),
		picture: d.text(),
		isCurrentlyAvailable: d
			.integer({ mode: "boolean" })
			.notNull()
			.default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("fuchsen_item_name_idx").on(t.name),
		index("fuchsen_item_available_idx").on(t.isCurrentlyAvailable),
	],
);

export const fuchsenOrders = createTable(
	"fuchsen_order",
	(o) => ({
		id: o
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: o.text({ length: 255 }).notNull(),
		userName: o.text({ length: 255 }).notNull(),
		itemId: o.text({ length: 255 }).notNull(),
		itemName: o.text({ length: 255 }).notNull(),
		amount: o.integer().notNull(),
		pricePerUnit: o.real().notNull(),
		total: o.real().notNull(),
		status: o
			.text({ enum: ["Offen", "Bezahlt"] })
			.notNull()
			.default("Offen"),
		paidAt: o.integer({ mode: "timestamp" }),
		createdAt: o
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: o.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("fuchsen_order_user_idx").on(t.userId),
		index("fuchsen_order_item_idx").on(t.itemId),
		index("fuchsen_order_status_idx").on(t.status),
		index("fuchsen_order_created_idx").on(t.createdAt),
		foreignKey({
			columns: [t.itemId],
			foreignColumns: [fuchsenItems.id],
			name: "fuchsen_order_item_fk",
		}),
	],
);

export const fuchsenItemsRelations = relations(fuchsenItems, ({ many }) => ({
	orders: many(fuchsenOrders),
}));

export const fuchsenOrdersRelations = relations(fuchsenOrders, ({ one }) => ({
	item: one(fuchsenItems, {
		fields: [fuchsenOrders.itemId],
		references: [fuchsenItems.id],
	}),
	user: one(users, {
		fields: [fuchsenOrders.userId],
		references: [users.id],
	}),
}));

export const homepageSections = createTable(
	"homepage_section",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		key: d.text({ length: 100 }).notNull().unique(),
		label: d.text({ length: 255 }).notNull(),
		displayOrder: d.integer().notNull().default(0),
		isActive: d.integer({ mode: "boolean" }).notNull().default(true),
		createdAt: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
	}),
	(t) => [index("homepage_section_active_idx").on(t.isActive)],
);

// ─── CC-Kasse (Treasury): Etaplan, Kostenpunkte, Reimbursements ───────────────
//
// Per-semester budget plan ("Etatplan") with category-grouped cost items
// ("Kostenpunkte"), each holding line-item "Positionen", plus member
// reimbursements ("Kostenrückerstattungen") booked against a Kostenpunkt.

export const etaplans = createTable(
	"etaplan",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		name: d.text({ length: 255 }).notNull(), // e.g. "SS 2026"
		semesterType: d.text({ enum: ["SS", "WS"] }).notNull(),
		year: d.integer().notNull(),
		// Nullable → backfill of older semesters with custom dates.
		startDate: d.integer({ mode: "timestamp" }),
		endDate: d.integer({ mode: "timestamp" }),
		status: d
			.text({ enum: ["Aktiv", "Abgeschlossen"] })
			.notNull()
			.default("Aktiv"),
		notes: d.text({ length: 1000 }),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("etaplan_status_idx").on(t.status),
		index("etaplan_year_idx").on(t.year),
	],
);

export const kostenpunkte = createTable(
	"kostenpunkt",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		etaplanId: d
			.text({ length: 255 })
			.notNull()
			.references(() => etaplans.id, { onDelete: "cascade" }),
		category: d.text({ length: 255 }).notNull(), // Gruppe
		categoryOrder: d.integer().notNull().default(0),
		name: d.text({ length: 255 }).notNull(),
		description: d.text({ length: 1000 }),
		// Cached aggregates of the child positions (kept in sync by the actions).
		budget: d.real().notNull().default(0),
		income: d.real().notNull().default(0),
		eventId: d
			.text({ length: 255 })
			.references(() => events.id, { onDelete: "set null" }),
		displayOrder: d.integer().notNull().default(0),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("kostenpunkt_etaplan_idx").on(t.etaplanId),
		index("kostenpunkt_event_idx").on(t.eventId),
		index("kostenpunkt_category_idx").on(t.etaplanId, t.categoryOrder),
	],
);

export const kostenpunktPositionen = createTable(
	"kostenpunkt_position",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		kostenpunktId: d
			.text({ length: 255 })
			.notNull()
			.references(() => kostenpunkte.id, { onDelete: "cascade" }),
		bemerkung: d.text({ length: 500 }),
		ausgaben: d.real().notNull().default(0),
		einnahmen: d.real().notNull().default(0),
		displayOrder: d.integer().notNull().default(0),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [index("position_kostenpunkt_idx").on(t.kostenpunktId)],
);

export type ReceiptFile = { url: string; name: string };

export const kostenerstattungen = createTable(
	"kostenerstattung",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		// FK declared in the index array below with onDelete "restrict".
		kostenpunktId: d.text({ length: 255 }).notNull(),
		etaplanId: d
			.text({ length: 255 })
			.notNull()
			.references(() => etaplans.id, { onDelete: "cascade" }),
		source: d
			.text({ enum: ["Antrag", "Direktbuchung"] })
			.notNull()
			.default("Antrag"),
		status: d
			.text({ enum: ["Eingereicht", "Genehmigt", "Ausgezahlt", "Abgelehnt"] })
			.notNull()
			.default("Eingereicht"),
		description: d.text({ length: 500 }).notNull(),
		amount: d.real().notNull(),
		submittedBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		recipientName: d.text({ length: 255 }).notNull(),
		iban: d.text({ length: 50 }),
		// Legacy single-receipt fields — kept nullable for back-compat. New
		// submissions populate `receipts` (multiple). Safe to drop later via a
		// TTY-run migration once no old rows rely on them.
		receiptUrl: d.text(),
		receiptName: d.text({ length: 255 }),
		receipts: d.text({ mode: "json" }).$type<ReceiptFile[]>(),
		// When the money was spent (custom past date for backfill).
		expenseDate: d
			.integer({ mode: "timestamp" })
			.notNull()
			.$defaultFn(() => new Date()),
		approvedBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		approvedAt: d.integer({ mode: "timestamp" }),
		paidBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		paidAt: d.integer({ mode: "timestamp" }),
		rejectedBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		rejectedAt: d.integer({ mode: "timestamp" }),
		rejectionReason: d.text({ length: 500 }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("erstattung_kostenpunkt_idx").on(t.kostenpunktId),
		index("erstattung_etaplan_idx").on(t.etaplanId),
		index("erstattung_status_idx").on(t.status),
		index("erstattung_submitter_idx").on(t.submittedBy),
		index("erstattung_etaplan_status_idx").on(t.etaplanId, t.status),
		foreignKey({
			columns: [t.kostenpunktId],
			foreignColumns: [kostenpunkte.id],
			name: "erstattung_kostenpunkt_fk",
		}).onDelete("restrict"),
	],
);

export const userPaymentInfo = createTable("user_payment_info", (d) => ({
	userId: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.references(() => users.id, { onDelete: "cascade" }),
	accountHolder: d.text({ length: 255 }).notNull(),
	iban: d.text({ length: 50 }).notNull(),
	createdAt: d
		.integer({ mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
	updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
}));

export const etaplansRelations = relations(etaplans, ({ one, many }) => ({
	createdBy: one(users, {
		fields: [etaplans.createdBy],
		references: [users.id],
	}),
	kostenpunkte: many(kostenpunkte),
	erstattungen: many(kostenerstattungen),
}));

export const kostenpunkteRelations = relations(
	kostenpunkte,
	({ one, many }) => ({
		etaplan: one(etaplans, {
			fields: [kostenpunkte.etaplanId],
			references: [etaplans.id],
		}),
		event: one(events, {
			fields: [kostenpunkte.eventId],
			references: [events.id],
		}),
		positionen: many(kostenpunktPositionen),
		erstattungen: many(kostenerstattungen),
	}),
);

export const kostenpunktPositionenRelations = relations(
	kostenpunktPositionen,
	({ one }) => ({
		kostenpunkt: one(kostenpunkte, {
			fields: [kostenpunktPositionen.kostenpunktId],
			references: [kostenpunkte.id],
		}),
	}),
);

export const kostenerstattungenRelations = relations(
	kostenerstattungen,
	({ one }) => ({
		kostenpunkt: one(kostenpunkte, {
			fields: [kostenerstattungen.kostenpunktId],
			references: [kostenpunkte.id],
		}),
		etaplan: one(etaplans, {
			fields: [kostenerstattungen.etaplanId],
			references: [etaplans.id],
		}),
		submitter: one(users, {
			fields: [kostenerstattungen.submittedBy],
			references: [users.id],
			relationName: "erstattung_submitter",
		}),
		approver: one(users, {
			fields: [kostenerstattungen.approvedBy],
			references: [users.id],
			relationName: "erstattung_approver",
		}),
		payer: one(users, {
			fields: [kostenerstattungen.paidBy],
			references: [users.id],
			relationName: "erstattung_payer",
		}),
		rejecter: one(users, {
			fields: [kostenerstattungen.rejectedBy],
			references: [users.id],
			relationName: "erstattung_rejecter",
		}),
	}),
);

export const userPaymentInfoRelations = relations(
	userPaymentInfo,
	({ one }) => ({
		user: one(users, {
			fields: [userPaymentInfo.userId],
			references: [users.id],
		}),
	}),
);

export type Etaplan = typeof etaplans.$inferSelect;
export type NewEtaplan = typeof etaplans.$inferInsert;
export type Kostenpunkt = typeof kostenpunkte.$inferSelect;
export type KostenpunktPosition = typeof kostenpunktPositionen.$inferSelect;
export type Kostenerstattung = typeof kostenerstattungen.$inferSelect;
export type UserPaymentInfo = typeof userPaymentInfo.$inferSelect;

// ─── Mitglieder (Adressliste) + Semesterbeitrag ───────────────────────────────
//
// `members` is the directory source of truth, decoupled from `users` (most Alte
// Herren have no app account). An optional `userId` links a member to an account
// (auto-linked by email on profile load).

export const members = createTable(
	"member",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		userId: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		// Abteilung — free text to preserve spreadsheet variants (iaCBoB, AH idC,
		// FCK, …); beitragspflichtig is derived in code, not from a DB enum.
		status: d.text().notNull(),
		firstName: d.text({ length: 255 }).notNull(),
		lastName: d.text({ length: 255 }).notNull(),
		// Member contact email — distinct from users.email; may be null.
		email: d.text({ length: 255 }),
		street: d.text({ length: 255 }),
		houseNumber: d.text({ length: 50 }),
		addressLine2: d.text({ length: 255 }),
		postalCode: d.text({ length: 20 }), // text: leading zeros / non-DE
		city: d.text({ length: 255 }),
		country: d.text({ length: 100 }).default("Deutschland"),
		lettersOptOut: d.integer({ mode: "boolean" }).notNull().default(false),
		addressNeedsUpdate: d.integer({ mode: "boolean" }).notNull().default(false),
		notes: d.text({ length: 1000 }),
		// Extended fields imported from the member spreadsheet.
		externalId: d.text({ length: 100 }), // source list ID (stable match key)
		title: d.text({ length: 255 }), // Position / academic title
		mobile: d.text({ length: 100 }),
		phonePrivate: d.text({ length: 100 }),
		phonePrivate2: d.text({ length: 100 }),
		email2: d.text({ length: 255 }),
		email3: d.text({ length: 255 }),
		company: d.text({ length: 255 }),
		phoneWork: d.text({ length: 100 }),
		phoneWork2: d.text({ length: 100 }),
		birthday: d.text({ length: 50 }),
		forwarding: d.integer({ mode: "boolean" }).notNull().default(false),
		// Lossless round-trip of any unmapped spreadsheet columns (e.g. SharePoint
		// metadata: Geändert / Elementtyp / Pfad).
		extra: d.text({ mode: "json" }).$type<Record<string, string>>(),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		updatedBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("member_user_idx").on(t.userId),
		index("member_status_idx").on(t.status),
		index("member_email_idx").on(t.email),
		index("member_name_idx").on(t.lastName, t.firstName),
		index("member_external_idx").on(t.externalId),
	],
);

export const semesterbeitragRuns = createTable(
	"semesterbeitrag_run",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		etaplanId: d
			.text({ length: 255 })
			.notNull()
			.references(() => etaplans.id, { onDelete: "cascade" }),
		// FK to kostenpunkte declared in the index array (restrict).
		kostenpunktId: d.text({ length: 255 }).notNull(),
		name: d.text({ length: 255 }).notNull(),
		amount: d.real().notNull().default(28),
		mahnungFee: d.real().notNull().default(5),
		dueDate: d.integer({ mode: "timestamp" }).notNull(),
		status: d
			.text({ enum: ["Offen", "Abgeschlossen"] })
			.notNull()
			.default("Offen"),
		createdBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		index("beitrag_run_etaplan_idx").on(t.etaplanId),
		index("beitrag_run_kp_idx").on(t.kostenpunktId),
		index("beitrag_run_status_idx").on(t.status),
		foreignKey({
			columns: [t.kostenpunktId],
			foreignColumns: [kostenpunkte.id],
			name: "beitrag_run_kp_fk",
		}).onDelete("restrict"),
	],
);

export const semesterbeitragCharges = createTable(
	"semesterbeitrag_charge",
	(d) => ({
		id: d
			.text({ length: 255 })
			.notNull()
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		runId: d
			.text({ length: 255 })
			.notNull()
			.references(() => semesterbeitragRuns.id, { onDelete: "cascade" }),
		memberId: d
			.text({ length: 255 })
			.notNull()
			.references(() => members.id, { onDelete: "cascade" }),
		memberName: d.text({ length: 255 }).notNull(), // snapshot
		baseAmount: d.real().notNull(),
		mahnungAmount: d.real().notNull().default(0),
		status: d
			.text({ enum: ["Offen", "Bezahlt", "Gemahnt"] })
			.notNull()
			.default("Offen"),
		deliveryMethod: d.text({ enum: ["email", "letter"] }),
		emailSentAt: d.integer({ mode: "timestamp" }),
		mahnungSentAt: d.integer({ mode: "timestamp" }),
		paidAt: d.integer({ mode: "timestamp" }),
		paidBy: d
			.text({ length: 255 })
			.references(() => users.id, { onDelete: "set null" }),
		createdAt: d
			.integer({ mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
	}),
	(t) => [
		uniqueIndex("beitrag_charge_unique_idx").on(t.runId, t.memberId),
		index("beitrag_charge_run_idx").on(t.runId),
		index("beitrag_charge_member_idx").on(t.memberId),
		index("beitrag_charge_status_idx").on(t.status),
	],
);

export const membersRelations = relations(members, ({ one, many }) => ({
	user: one(users, { fields: [members.userId], references: [users.id] }),
	charges: many(semesterbeitragCharges),
}));

export const semesterbeitragRunsRelations = relations(
	semesterbeitragRuns,
	({ one, many }) => ({
		etaplan: one(etaplans, {
			fields: [semesterbeitragRuns.etaplanId],
			references: [etaplans.id],
		}),
		kostenpunkt: one(kostenpunkte, {
			fields: [semesterbeitragRuns.kostenpunktId],
			references: [kostenpunkte.id],
		}),
		charges: many(semesterbeitragCharges),
	}),
);

export const semesterbeitragChargesRelations = relations(
	semesterbeitragCharges,
	({ one }) => ({
		run: one(semesterbeitragRuns, {
			fields: [semesterbeitragCharges.runId],
			references: [semesterbeitragRuns.id],
		}),
		member: one(members, {
			fields: [semesterbeitragCharges.memberId],
			references: [members.id],
		}),
	}),
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type SemesterbeitragRun = typeof semesterbeitragRuns.$inferSelect;
export type SemesterbeitragCharge = typeof semesterbeitragCharges.$inferSelect;
