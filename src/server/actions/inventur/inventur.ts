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
  stockStatus,
} from "~/server/db/schema";

export type StockStatusWithDetails = {
  drinkId: string;
  drinkName: string;
  lastInventoryStock: number;
  purchasedSince: number;
  soldSince: number;
  adjustmentsSince: number;
  calculatedStock: number;
  istStock: number; // Latest actual count if available
  currentPrice: number;
  lastInventoryDate: Date | null;
};

export type InventoryWithItems = {
  id: string;
  inventoryDate: Date;
  status: string;
  notes: string | null;
  totalLosses: number;
  items: Array<{
    drinkId: string;
    drinkName: string;
    countedStock: number;
    expectedStock: number;
    difference: number;
  }>;
};

// Get current stock status for all drinks
export async function getStockData(): Promise<StockStatusWithDetails[]> {
  // Get all drinks
  const allDrinks = await db
    .select()
    .from(drinks)
    .where(eq(drinks.isCurrentlyAvailable, true));

  // Get latest active inventory
  const latestInventory = await db
    .select()
    .from(inventories)
    .where(eq(inventories.status, "active"))
    .orderBy(desc(inventories.inventoryDate))
    .limit(1);

  const lastInventoryDate = latestInventory[0]?.inventoryDate || null;

  // Get stock status for each drink
  const stockData = await Promise.all(
    allDrinks.map(async (drink) => {
      // Get stock status from stockStatus table
      let status = await db
        .select()
        .from(stockStatus)
        .where(eq(stockStatus.drinkId, drink.id))
        .limit(1);

      // If no status exists, create default
      if (status.length === 0) {
        await db.insert(stockStatus).values({
          drinkId: drink.id,
          drinkName: drink.name,
          lastInventoryStock: 0,
          purchasedSince: 0,
          soldSince: 0,
          adjustmentsSince: 0,
          calculatedStock: 0,
          currentPrice: drink.price,
        });

        status = await db
          .select()
          .from(stockStatus)
          .where(eq(stockStatus.drinkId, drink.id))
          .limit(1);
      }

      // Calculate sold since last inventory
      const soldSinceInventory = lastInventoryDate
        ? await db
            .select({
              total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
            })
            .from(orders)
            .where(
              and(
                eq(orders.drinkId, drink.id),
                eq(orders.inBill, false),
                gte(orders.createdAt, lastInventoryDate)
              )
            )
        : [{ total: 0 }];

      // Get latest counted stock if available
      const latestCount = lastInventoryDate
        ? await db
            .select()
            .from(inventoryItems)
            .innerJoin(
              inventories,
              eq(inventoryItems.inventoryId, inventories.id)
            )
            .where(
              and(
                eq(inventoryItems.drinkId, drink.id),
                eq(inventories.status, "active")
              )
            )
            .orderBy(desc(inventories.inventoryDate))
            .limit(1)
        : [];

      const currentStatus = status[0];

      return {
        drinkId: drink.id,
        drinkName: drink.name,
        lastInventoryStock: currentStatus.lastInventoryStock,
        purchasedSince: currentStatus.purchasedSince,
        soldSince: soldSinceInventory[0].total,
        adjustmentsSince: currentStatus.adjustmentsSince,
        calculatedStock:
          currentStatus.lastInventoryStock +
          currentStatus.purchasedSince -
          soldSinceInventory[0].total +
          currentStatus.adjustmentsSince,
        istStock: latestCount[0]?.inventory_item.countedStock || 0,
        currentPrice: drink.price,
        lastInventoryDate,
      };
    })
  );

  return stockData;
}

// Get inventory history
export async function getInventoryHistory(): Promise<InventoryWithItems[]> {
  const inventoriesData = await db
    .select()
    .from(inventories)
    .where(eq(inventories.status, "active"))
    .orderBy(desc(inventories.inventoryDate))
    .limit(10);

  const historyWithItems = await Promise.all(
    inventoriesData.map(async (inv) => {
      const items = await db
        .select()
        .from(inventoryItems)
        .where(eq(inventoryItems.inventoryId, inv.id));

      // Calculate total losses for this inventory
      let totalLosses = 0;
      const itemsWithDetails = await Promise.all(
        items.map(async (item) => {
          // Get expected stock at time of inventory
          const drinkData = await db
            .select()
            .from(drinks)
            .where(eq(drinks.id, item.drinkId))
            .limit(1);

          const expectedStock = 0; // This would need calculation based on previous inventory
          const difference = item.countedStock - expectedStock;
          const loss = difference < 0 ? Math.abs(difference) * item.price : 0;
          totalLosses += loss;

          return {
            drinkId: item.drinkId,
            drinkName: item.drinkName,
            countedStock: item.countedStock,
            expectedStock,
            difference,
          };
        })
      );

      return {
        id: inv.id,
        inventoryDate: inv.inventoryDate,
        status: inv.status,
        notes: inv.notes,
        totalLosses,
        items: itemsWithDetails,
      };
    })
  );

  return historyWithItems;
}

// Save inventory count
export async function saveInventoryCount(
  items: Array<{ drinkId: string; countedStock: number }>
) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      // Create new inventory
      const [newInventory] = await tx
        .insert(inventories)
        .values({
          status: "active",
          performedBy: session.user.id,
        })
        .returning();

      // Insert inventory items and update stock status
      for (const item of items) {
        const drink = await tx
          .select()
          .from(drinks)
          .where(eq(drinks.id, item.drinkId))
          .limit(1);

        if (drink[0]) {
          // Insert inventory item
          await tx.insert(inventoryItems).values({
            inventoryId: newInventory.id,
            drinkId: item.drinkId,
            drinkName: drink[0].name,
            countedStock: item.countedStock,
            price: drink[0].price,
          });

          // Update stock status
          await tx
            .update(stockStatus)
            .set({
              lastInventoryStock: item.countedStock,
              purchasedSince: 0,
              soldSince: 0,
              adjustmentsSince: 0,
              calculatedStock: item.countedStock,
              lastInventoryId: newInventory.id,
              lastInventoryDate: newInventory.inventoryDate,
              lastUpdated: new Date(),
            })
            .where(eq(stockStatus.drinkId, item.drinkId));
        }
      }

      // Close previous inventories
      await tx
        .update(inventories)
        .set({ status: "closed", closedAt: new Date() })
        .where(
          and(
            eq(inventories.status, "active"),
            ne(inventories.id, newInventory.id)
          )
        );
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to save inventory:", error);
    return { success: false, error: "Failed to save inventory" };
  }
}

export async function applyStockAdjustment(
  drinkId: string,
  adjustment: number,
  reason: string,
  unitPrice: number,
  totalCost: number
) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      // Update stock status with adjustment
      const currentStatus = await tx
        .select()
        .from(stockStatus)
        .where(eq(stockStatus.drinkId, drinkId))
        .limit(1);

      if (currentStatus.length === 0) {
        return { success: false, error: "Drink not found in stock status" };
      }

      const newAdjustmentsSince =
        currentStatus[0].adjustmentsSince + adjustment;
      const newCalculatedStock =
        currentStatus[0].lastInventoryStock +
        currentStatus[0].purchasedSince -
        currentStatus[0].soldSince +
        newAdjustmentsSince;

      await tx
        .update(stockStatus)
        .set({
          adjustmentsSince: newAdjustmentsSince,
          calculatedStock: newCalculatedStock,
          lastUpdated: new Date(),
        })
        .where(eq(stockStatus.drinkId, drinkId));
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to apply stock adjustment:", error);
    return { success: false, error: "Failed to apply adjustment" };
  }
}
