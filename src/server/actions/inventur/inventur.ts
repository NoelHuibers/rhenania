// server/actions/inventur/inventur.ts
"use server";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  drinks,
  inventories,
  inventoryItems,
  orders,
} from "~/server/db/schema";

export type StockStatusWithDetails = {
  drinkId: string;
  drinkName: string;
  lastInventoryStock: number;
  purchasedSince: number;
  soldSince: number;
  calculatedStock: number;
  currentPrice: number;
  lastInventoryDate: Date | null;
};

export type InventoryWithItems = {
  id: string;
  inventoryDate: Date;
  status: string;
  totalLosses: number;
  items: Array<{
    drinkId: string;
    drinkName: string;
    countedStock: number;
    expectedStock: number;
    difference: number;
    lossValue: number;
  }>;
};

// Get current stock status for all drinks - ALWAYS fetch fresh sales data
export async function getStockData(): Promise<StockStatusWithDetails[]> {
  // Get all available drinks
  const allDrinks = await db
    .select()
    .from(drinks)
    .where(eq(drinks.isCurrentlyAvailable, true));

  // Get latest inventory items for each drink
  const stockData = await Promise.all(
    allDrinks.map(async (drink) => {
      // Get the most recent inventory item for this drink
      const lastInventoryItem = await db
        .select()
        .from(inventoryItems)
        .innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
        .where(eq(inventoryItems.drinkId, drink.id))
        .orderBy(desc(inventories.createdAt)) // Use inventory's createdAt
        .limit(1);

      if (!lastInventoryItem[0]) {
        // No inventory history for this drink
        return {
          drinkId: drink.id,
          drinkName: drink.name,
          lastInventoryStock: 0,
          purchasedSince: 0,
          soldSince: 0,
          calculatedStock: 0,
          currentPrice: drink.price,
          lastInventoryDate: null,
        };
      }

      const inventoryItem = lastInventoryItem[0].inventory_item;
      const lastInventoryDate = lastInventoryItem[0].inventory.createdAt; // Use inventory's createdAt

      // ALWAYS calculate fresh sold count from orders
      const soldSince = await db
        .select({
          total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.drinkId, drink.id),
            gte(orders.createdAt, lastInventoryDate)
          )
        );

      const soldCount = Number(soldSince[0]?.total || 0);

      return {
        drinkId: drink.id,
        drinkName: drink.name,
        lastInventoryStock: inventoryItem.countedStock,
        purchasedSince: 0, // Will be entered in UI
        soldSince: soldCount, // Always fresh from orders table
        calculatedStock: inventoryItem.countedStock - soldCount,
        currentPrice: drink.price,
        lastInventoryDate,
      };
    })
  );

  return stockData;
}

// Get inventory history - show historical snapshots
export async function getInventoryHistory(): Promise<InventoryWithItems[]> {
  const inventoriesData = await db
    .select()
    .from(inventories)
    .where(eq(inventories.status, "closed"))
    .orderBy(desc(inventories.createdAt))
    .limit(10);

  const historyWithItems = await Promise.all(
    inventoriesData.map(async (inv) => {
      const items = await db
        .select({
          inventoryItem: inventoryItems,
          drinkName: drinks.name,
        })
        .from(inventoryItems)
        .innerJoin(drinks, eq(inventoryItems.drinkId, drinks.id))
        .where(eq(inventoryItems.inventoryId, inv.id));

      let totalLosses = 0;
      const itemsWithDetails = items.map((item) => {
        // Use the snapshot data stored at inventory time
        const expectedStock =
          item.inventoryItem.previousStock +
          item.inventoryItem.purchasedSince -
          item.inventoryItem.soldSince;

        const difference = item.inventoryItem.countedStock - expectedStock;
        const lossValue =
          difference < 0
            ? Math.abs(difference) * item.inventoryItem.priceAtCount
            : 0;

        totalLosses += lossValue;

        return {
          drinkId: item.inventoryItem.drinkId,
          drinkName: item.drinkName,
          countedStock: item.inventoryItem.countedStock,
          expectedStock,
          difference,
          lossValue,
        };
      });

      return {
        id: inv.id,
        inventoryDate: inv.createdAt,
        status: inv.status,
        totalLosses,
        items: itemsWithDetails,
      };
    })
  );

  return historyWithItems;
}

// Save inventory count - snapshot current state
export async function saveInventoryCount(
  items: Array<{
    drinkId: string;
    countedStock: number;
    purchasedSince: number; // From UI input
  }>
) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      // Close current active inventory if exists
      await tx
        .update(inventories)
        .set({
          status: "closed",
          closedAt: new Date(),
        })
        .where(eq(inventories.status, "active"));

      // Create new inventory
      const [newInventory] = await tx
        .insert(inventories)
        .values({
          status: "active",
          performedBy: session.user.id,
        })
        .returning();

      if (!newInventory) {
        throw new Error("Failed to create inventory");
      }

      // Insert inventory items
      for (const item of items) {
        // Get drink details
        const drink = await tx
          .select()
          .from(drinks)
          .where(eq(drinks.id, item.drinkId))
          .limit(1);

        if (!drink[0]) continue;

        // Get previous inventory for this drink with joined inventory data
        const previousInventory = await tx
          .select()
          .from(inventoryItems)
          .innerJoin(
            inventories,
            eq(inventoryItems.inventoryId, inventories.id)
          )
          .where(eq(inventoryItems.drinkId, item.drinkId))
          .orderBy(desc(inventories.createdAt)) // Use inventory's createdAt
          .limit(1);

        const previousStock =
          previousInventory[0]?.inventory_item.countedStock || 0;
        const previousDate =
          previousInventory[0]?.inventory.createdAt || new Date(0);

        // Calculate CURRENT sold count from orders for the snapshot
        const soldSince = await tx
          .select({
            total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
          })
          .from(orders)
          .where(
            and(
              eq(orders.drinkId, item.drinkId),
              gte(orders.createdAt, previousDate)
            )
          );

        // Store snapshot of current state
        await tx.insert(inventoryItems).values({
          inventoryId: newInventory.id,
          drinkId: item.drinkId,
          countedStock: item.countedStock,
          previousStock,
          purchasedSince: item.purchasedSince,
          soldSince: Number(soldSince[0]?.total || 0), // Snapshot of sales at this moment
          priceAtCount: drink[0].price,
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to save inventory:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save inventory",
    };
  }
}

// Get current inventory status
export async function getCurrentInventoryStatus() {
  const activeInventory = await db
    .select()
    .from(inventories)
    .where(eq(inventories.status, "active"))
    .limit(1);

  if (!activeInventory[0]) {
    return { hasActiveInventory: false, inventoryId: null };
  }

  const itemCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(inventoryItems)
    .where(eq(inventoryItems.inventoryId, activeInventory[0].id));

  return {
    hasActiveInventory: true,
    inventoryId: activeInventory[0].id,
    createdAt: activeInventory[0].createdAt,
    itemCount: Number(itemCount[0]?.count || 0),
  };
}

// Get detailed stock analysis for a specific drink
export async function getDrinkStockHistory(drinkId: string, limit = 10) {
  const history = await db
    .select({
      inventoryItem: inventoryItems,
      inventory: inventories,
    })
    .from(inventoryItems)
    .innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
    .where(eq(inventoryItems.drinkId, drinkId))
    .orderBy(desc(inventories.createdAt)) // Use inventory's createdAt
    .limit(limit);

  return history.map((h) => ({
    date: h.inventory.createdAt,
    countedStock: h.inventoryItem.countedStock,
    previousStock: h.inventoryItem.previousStock,
    purchasedSince: h.inventoryItem.purchasedSince,
    soldSince: h.inventoryItem.soldSince,
    expectedStock:
      h.inventoryItem.previousStock +
      h.inventoryItem.purchasedSince -
      h.inventoryItem.soldSince,
    difference:
      h.inventoryItem.countedStock -
      (h.inventoryItem.previousStock +
        h.inventoryItem.purchasedSince -
        h.inventoryItem.soldSince),
    priceAtCount: h.inventoryItem.priceAtCount,
  }));
}
