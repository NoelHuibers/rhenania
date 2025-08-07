import { relations, sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  primaryKey,
  sqliteTableCreator,
} from "drizzle-orm/sqlite-core";
import type { AdapterAccount } from "next-auth/adapters";

/**
 * This is an example of how to use the multi-project schema feature of Drizzle ORM. Use the same
 * database instance for multiple projects.
 *
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = sqliteTableCreator((name) => `rhenania2_${name}`);

export const posts = createTable(
  "post",
  (d) => ({
    id: d.integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
    name: d.text({ length: 256 }),
    createdById: d
      .text({ length: 255 })
      .notNull()
      .references(() => users.id),
    createdAt: d
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: d.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index("created_by_idx").on(t.createdById),
    index("name_idx").on(t.name),
  ]
);

export const users = createTable("user", (d) => ({
  id: d
    .text({ length: 255 })
    .notNull()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: d.text({ length: 255 }),
  email: d.text({ length: 255 }).notNull(),
  emailVerified: d.integer({ mode: "timestamp" }).default(sql`(unixepoch())`),
  image: d.text({ length: 255 }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
}));

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

export const drinks = createTable(
  "drink",
  (d) => ({
    id: d
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: d.text({ length: 255 }).notNull(),
    price: d.real().notNull(), // Using real for decimal prices
    kastengroesse: d.integer(), // Crate size as optional number
    picture: d.text(), // Store image URL or base64
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
    pricePerUnit: o.real().notNull(), // Store price at time of order
    total: o.real().notNull(),
    inBill: o.integer({ mode: "boolean" }).notNull().default(false),

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
    // Foreign key constraint
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
    billNumber: bp.integer().notNull().unique(), // 0, 1, 2, 3... auto-incrementing
    totalAmount: bp.real().notNull().default(0), // Total amount across all bills
    createdAt: bp
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: bp.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    closedAt: bp.integer({ mode: "timestamp" }), // When the billing period was closed
  }),
  (t) => [
    index("bill_period_number_idx").on(t.billNumber),
    index("bill_period_dates_idx").on(t.createdAt),
  ]
);

// Updated bills table - now references billPeriodId instead of individual dates
export const bills = createTable(
  "bill",
  (b) => ({
    id: b
      .text({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    billPeriodId: b.text({ length: 255 }).notNull(), // Foreign key to billPeriods
    userId: b.text({ length: 255 }).notNull(),
    userName: b.text({ length: 255 }).notNull(),
    status: b
      .text({
        enum: ["Bezahlt", "Unbezahlt", "Gestundet"],
      })
      .notNull()
      .default("Unbezahlt"),
    oldBillingAmount: b.real().notNull().default(0), // Previous outstanding balance
    fees: b.real().notNull().default(0), // Additional fees
    drinksTotal: b.real().notNull(), // Total from drinks only
    total: b.real().notNull(), // Final total (drinks + oldBillingAmount + fees)
    createdAt: b
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    updatedAt: b.integer({ mode: "timestamp" }).$onUpdate(() => new Date()),
    paidAt: b.integer({ mode: "timestamp" }), // When the bill was paid
  }),
  (t) => [
    index("bill_period_idx").on(t.billPeriodId),
    index("bill_user_idx").on(t.userId),
    index("bill_status_idx").on(t.status),
    index("bill_created_idx").on(t.createdAt),
    // Foreign key constraint
    foreignKey({
      columns: [t.billPeriodId],
      foreignColumns: [billPeriods.id],
      name: "bill_period_fk",
    }),
  ]
);

// Bill items table remains the same
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
    amount: bi.integer().notNull(), // Quantity of this drink
    pricePerDrink: bi.real().notNull(), // Price per unit at time of billing
    totalPricePerDrink: bi.real().notNull(), // amount * pricePerDrink
    createdAt: bi
      .integer({ mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
  }),
  (t) => [
    index("bill_item_bill_idx").on(t.billId),
    index("bill_item_drink_idx").on(t.drinkName),
    // Foreign key constraint
    foreignKey({
      columns: [t.billId],
      foreignColumns: [bills.id],
      name: "bill_item_bill_fk",
    }).onDelete("cascade"),
  ]
);

// Updated relations
export const billPeriodsRelations = {
  bills: {
    relation: "one-to-many",
    target: bills,
    fields: [billPeriods.id],
    references: [bills.billPeriodId],
  },
};

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
