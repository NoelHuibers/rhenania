// server/actions/inventur/inventur.ts
"use server";

import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  drinks,
  inventories,
  inventoryItems,
  orders,
  stockAdjustments,
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

export type StockAdjustmentInput = {
  drinkId: string;
  adjustmentType: "purchase" | "correction" | "loss" | "return";
  quantity: number;
  unitPrice: number;
  totalCost: number;
  reason?: string;
  invoiceNumber?: string;
  supplier?: string;
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
          lastUpdated: new Date(),
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
            .select({
              countedStock: inventoryItems.countedStock,
            })
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

      // Update sold since in the database
      if (
        currentStatus &&
        soldSinceInventory[0] &&
        soldSinceInventory[0].total !== currentStatus.soldSince
      ) {
        await db
          .update(stockStatus)
          .set({
            soldSince: soldSinceInventory[0].total,
            calculatedStock:
              currentStatus.lastInventoryStock +
              currentStatus.purchasedSince -
              soldSinceInventory[0].total +
              currentStatus.adjustmentsSince,
            lastUpdated: new Date(),
          })
          .where(eq(stockStatus.drinkId, drink.id));
      }

      return {
        drinkId: drink.id,
        drinkName: drink.name,
        lastInventoryStock: currentStatus?.lastInventoryStock || 0,
        purchasedSince: currentStatus?.purchasedSince || 0,
        soldSince: soldSinceInventory[0]?.total || 0,
        adjustmentsSince: currentStatus?.adjustmentsSince || 0,
        calculatedStock:
          (currentStatus?.lastInventoryStock || 0) +
          (currentStatus?.purchasedSince || 0) -
          (soldSinceInventory[0]?.total || 0) +
          (currentStatus?.adjustmentsSince || 0),
        istStock: latestCount[0]?.countedStock || 0,
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
          // Get the stock status at the time of this inventory
          const statusAtInventory = await db
            .select()
            .from(stockStatus)
            .where(eq(stockStatus.drinkId, item.drinkId))
            .limit(1);

          // For simplicity, we'll use the calculated stock as expected
          // In a real scenario, you'd calculate this based on the previous inventory
          const expectedStock = statusAtInventory[0]?.calculatedStock || 0;
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
          inventoryDate: new Date(),
        })
        .returning();

      if (!newInventory) {
        throw new Error("Failed to create inventory");
      }

      // Insert inventory items and update stock status
      for (const item of items) {
        const drink = await tx
          .select()
          .from(drinks)
          .where(eq(drinks.id, item.drinkId))
          .limit(1);

        if (drink[0]) {
          // Get current stock status to calculate the difference
          const currentStatus = await tx
            .select()
            .from(stockStatus)
            .where(eq(stockStatus.drinkId, item.drinkId))
            .limit(1);

          const calculatedStock = currentStatus[0]?.calculatedStock || 0;
          const difference = item.countedStock - calculatedStock;

          // Insert inventory item
          await tx.insert(inventoryItems).values({
            inventoryId: newInventory.id,
            drinkId: item.drinkId,
            drinkName: drink[0].name,
            countedStock: item.countedStock,
            price: drink[0].price,
          });

          // If there's a difference, create an adjustment record
          if (difference !== 0) {
            await tx.insert(stockAdjustments).values({
              drinkId: item.drinkId,
              drinkName: drink[0].name,
              adjustmentType: difference < 0 ? "loss" : "correction",
              quantity: difference,
              unitPrice: drink[0].price,
              totalCost: Math.abs(difference) * drink[0].price,
              reason: "Inventory count adjustment",
              performedBy: session.user.id,
            });
          }

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

// Apply stock adjustment (for purchases, losses, corrections)
export async function applyStockAdjustment(adjustment: StockAdjustmentInput) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      // Get drink details
      const drink = await tx
        .select()
        .from(drinks)
        .where(eq(drinks.id, adjustment.drinkId))
        .limit(1);

      if (!drink[0]) {
        throw new Error("Drink not found");
      }

      // Insert adjustment record
      await tx.insert(stockAdjustments).values({
        drinkId: adjustment.drinkId,
        drinkName: drink[0].name,
        adjustmentType: adjustment.adjustmentType,
        quantity: adjustment.quantity,
        unitPrice: adjustment.unitPrice,
        totalCost: adjustment.totalCost,
        reason: adjustment.reason,
        invoiceNumber: adjustment.invoiceNumber,
        supplier: adjustment.supplier,
        performedBy: session.user.id,
      });

      // Get current stock status
      const currentStatus = await tx
        .select()
        .from(stockStatus)
        .where(eq(stockStatus.drinkId, adjustment.drinkId))
        .limit(1);

      if (currentStatus.length === 0) {
        // Create new stock status if it doesn't exist
        await tx.insert(stockStatus).values({
          drinkId: adjustment.drinkId,
          drinkName: drink[0].name,
          lastInventoryStock: 0,
          purchasedSince:
            adjustment.adjustmentType === "purchase" ? adjustment.quantity : 0,
          soldSince: 0,
          adjustmentsSince:
            adjustment.adjustmentType !== "purchase" ? adjustment.quantity : 0,
          calculatedStock: adjustment.quantity,
          currentPrice: drink[0].price,
          lastUpdated: new Date(),
        });
      } else {
        // Update existing stock status
        const status = currentStatus[0]!;
        let newPurchasedSince = status.purchasedSince;
        let newAdjustmentsSince = status.adjustmentsSince;

        if (adjustment.adjustmentType === "purchase") {
          newPurchasedSince += adjustment.quantity;
        } else {
          newAdjustmentsSince += adjustment.quantity;
        }

        const newCalculatedStock =
          status.lastInventoryStock +
          newPurchasedSince -
          status.soldSince +
          newAdjustmentsSince;

        await tx
          .update(stockStatus)
          .set({
            purchasedSince: newPurchasedSince,
            adjustmentsSince: newAdjustmentsSince,
            calculatedStock: newCalculatedStock,
            lastUpdated: new Date(),
          })
          .where(eq(stockStatus.drinkId, adjustment.drinkId));
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to apply stock adjustment:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to apply adjustment",
    };
  }
}

// Get stock adjustments history
export async function getStockAdjustments(drinkId?: string) {
  const query = db
    .select()
    .from(stockAdjustments)
    .orderBy(desc(stockAdjustments.createdAt))
    .limit(50);

  if (drinkId) {
    return await query.where(eq(stockAdjustments.drinkId, drinkId));
  }

  return await query;
}

// Recalculate stock status (utility function for data integrity)
export async function recalculateStockStatus(drinkId: string) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      // Get last inventory for this drink
      const lastInventory = await tx
        .select()
        .from(inventoryItems)
        .innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
        .where(
          and(
            eq(inventoryItems.drinkId, drinkId),
            eq(inventories.status, "active")
          )
        )
        .orderBy(desc(inventories.inventoryDate))
        .limit(1);

      const lastInventoryStock =
        lastInventory[0]?.inventory_item.countedStock || 0;
      const lastInventoryDate =
        lastInventory[0]?.inventory.inventoryDate || null;

      // Calculate purchases since last inventory
      const purchases = lastInventoryDate
        ? await tx
            .select({
              total: sql<number>`COALESCE(SUM(${stockAdjustments.quantity}), 0)`,
            })
            .from(stockAdjustments)
            .where(
              and(
                eq(stockAdjustments.drinkId, drinkId),
                eq(stockAdjustments.adjustmentType, "purchase"),
                gte(stockAdjustments.createdAt, lastInventoryDate)
              )
            )
        : [{ total: 0 }];

      // Calculate other adjustments since last inventory
      const adjustments = lastInventoryDate
        ? await tx
            .select({
              total: sql<number>`COALESCE(SUM(${stockAdjustments.quantity}), 0)`,
            })
            .from(stockAdjustments)
            .where(
              and(
                eq(stockAdjustments.drinkId, drinkId),
                ne(stockAdjustments.adjustmentType, "purchase"),
                gte(stockAdjustments.createdAt, lastInventoryDate)
              )
            )
        : [{ total: 0 }];

      // Calculate sold since last inventory
      const sold = lastInventoryDate
        ? await tx
            .select({
              total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
            })
            .from(orders)
            .where(
              and(
                eq(orders.drinkId, drinkId),
                eq(orders.inBill, false),
                gte(orders.createdAt, lastInventoryDate)
              )
            )
        : [{ total: 0 }];

      const calculatedStock =
        lastInventoryStock +
        (purchases[0]?.total || 0) -
        (sold[0]?.total || 0) +
        (adjustments[0]?.total || 0);

      // Get drink details
      const drink = await tx
        .select()
        .from(drinks)
        .where(eq(drinks.id, drinkId))
        .limit(1);

      if (!drink[0]) {
        throw new Error("Drink not found");
      }

      // Update stock status
      await tx
        .update(stockStatus)
        .set({
          lastInventoryStock,
          purchasedSince: purchases[0]?.total || 0,
          soldSince: sold[0]?.total || 0,
          adjustmentsSince: adjustments[0]?.total || 0,
          calculatedStock,
          currentPrice: drink[0].price,
          lastInventoryId: lastInventory[0]?.inventory.id || null,
          lastInventoryDate,
          lastUpdated: new Date(),
        })
        .where(eq(stockStatus.drinkId, drinkId));
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to recalculate stock status:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to recalculate stock",
    };
  }
}
