// schema.ts
import { relations, sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  primaryKey,
  sqliteTableCreator,
} from "drizzle-orm/sqlite-core";
import type { AdapterAccount } from "next-auth/adapters";

export const createTable = sqliteTableCreator((name) => `rhenania2_${name}`);

export const users = createTable("user", (d) => ({
  id: d
    .text({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.text({ length: 255 }),
  email: d.text({ length: 255 }),
  emailVerified: d.integer({ mode: "timestamp" }),
  image: d.text({ length: 255 }),
  password: d.text({ length: 255 }),
}));

// New roles table
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

// Junction table for many-to-many relationship
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
  ]
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
  ]
);

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  })
);

export const accounts = createTable(
  "account",
  (d) => ({
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    type: d.text({ length: 255 }).$type<AdapterAccount["type"]>().notNull(),
    provider: d.text({ length: 255 }).notNull(),
    providerAccountId: d.text({ length: 255 }).notNull(),
    refresh_token: d.text(),
    access_token: d.text(),
    expires_at: d.integer(),
    token_type: d.text({ length: 255 }),
    scope: d.text({ length: 255 }),
    id_token: d.text(),
    session_state: d.text({ length: 255 }),
  }),
  (t) => [
    primaryKey({
      columns: [t.provider, t.providerAccountId],
    }),
    index("account_user_id_idx").on(t.userId),
  ]
);

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessions = createTable(
  "session",
  (d) => ({
    sessionToken: d.text({ length: 255 }).notNull().primaryKey(),
    userId: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    expires: d.integer({ mode: "timestamp" }).notNull(),
  }),
  (t) => [index("session_userId_idx").on(t.userId)]
);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const verificationTokens = createTable(
  "verification_token",
  (d) => ({
    identifier: d.text({ length: 255 }).notNull(),
    token: d.text({ length: 255 }).notNull(),
    expires: d.integer({ mode: "timestamp" }).notNull(),
  }),
  (t) => [primaryKey({ columns: [t.identifier, t.token] })]
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
  ]
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
  ]
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
  ]
);

export const billPeriods = createTable(
  "bill_period",
  (bp) => ({
    id: bp
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billNumber: bp.integer().notNull().unique(),
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
  ]
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
  ]
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
  ]
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
  gameType: d.text({ length: 50 }).default("bierjunge"),
}));

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
    blobUrl: bc.text().notNull(), // Vercel Blob URL
    fileName: bc.text({ length: 255 }).notNull(),
    delimiter: bc.text({ length: 10 }).notNull().default("\t"),
    fileSize: bc.integer(), // Size in bytes
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
  ]
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
