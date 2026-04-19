// schema.ts

import { relations, sql } from "drizzle-orm";
import {
	foreignKey,
	index,
	primaryKey,
	sqliteTableCreator,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Inlined so drizzle-kit can parse the schema without resolving path aliases
const KASSE_TYPES = [
	"Getränkekasse",
	"Aktivenkasse",
	"CC-Kasse",
	"Fuchsenkasse",
	"AHV Kasse",
	"Hausverein Kasse",
] as const;

export const createTable = sqliteTableCreator((name) => `rhenania_${name}`);

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
	accounts: many(accounts),
	sessions: many(sessions),
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

export const accounts = createTable(
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

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
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

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// Better Auth internal verification table (for OAuth state, email verification tokens, etc.)
export const verifications = createTable("verification", (d) => ({
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

// Custom invitation tokens table (admin creates user → sends email → user activates)
export const verificationTokens = createTable(
	"verification_token",
	(d) => ({
		identifier: d.text({ length: 255 }).notNull(),
		token: d.text({ length: 255 }).notNull(),
		expires: d.integer({ mode: "timestamp" }).notNull(),
	}),
	(t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

export const passwordResetTokens = createTable(
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
		proposedWinnerId: c
			.text({ length: 255 })
			.references(() => users.id),
		proposedById: c
			.text({ length: 255 })
			.references(() => users.id),
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

export const userStats = createTable("user_stat", (d) => ({
	id: d
		.text({ length: 255 })
		.notNull()
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	userId: d
		.text({ length: 255 })
		.notNull()
		.references(() => users.id),
	currentElo: d.integer().notNull().default(1200),
	totalGames: d.integer().notNull().default(0),
	wins: d.integer().notNull().default(0),
	losses: d.integer().notNull().default(0),
	lastGameAt: d.integer({ mode: "timestamp" }),
	peakElo: d.integer().notNull().default(1200),
	createdAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: d
		.integer({ mode: "timestamp" })
		.notNull()
		.$defaultFn(() => new Date()),
}));

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
		section: h
			.text({
				enum: ["header", "aktive", "haus", "footer"],
			})
			.notNull(),
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
		type: d
			.text({
				enum: [
					"Intern",
					"AHV",
					"oCC",
					"SC",
					"Jour Fix",
					"Stammtisch",
					"Sonstige",
				],
			})
			.notNull()
			.default("Sonstige"),
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
		type: d
			.text({
				enum: [
					"Intern",
					"AHV",
					"oCC",
					"SC",
					"Jour Fix",
					"Stammtisch",
					"Sonstige",
				],
			})
			.notNull()
			.default("Sonstige"),
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
		kasseType: d.text({ enum: KASSE_TYPES }).notNull(),
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
