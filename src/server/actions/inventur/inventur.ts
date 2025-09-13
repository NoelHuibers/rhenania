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

export async function getStockData(): Promise<StockStatusWithDetails[]> {
  const allDrinks = await db
    .select()
    .from(drinks)
    .where(eq(drinks.isCurrentlyAvailable, true));

  const stockData = await Promise.all(
    allDrinks.map(async (drink) => {
      const lastInventoryItem = await db
        .select()
        .from(inventoryItems)
        .innerJoin(inventories, eq(inventoryItems.inventoryId, inventories.id))
        .where(eq(inventoryItems.drinkId, drink.id))
        .orderBy(desc(inventories.createdAt))
        .limit(1);

      if (!lastInventoryItem[0]) {
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
      const lastInventoryDate = lastInventoryItem[0].inventory.createdAt;

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
        purchasedSince: inventoryItem.purchasedSince,
        soldSince: soldCount,
        calculatedStock:
          inventoryItem.countedStock + inventoryItem.purchasedSince - soldCount,
        currentPrice: drink.price,
        lastInventoryDate,
      };
    })
  );
  return stockData;
}

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

export async function saveInventoryCount(
  items: Array<{
    drinkId: string;
    countedStock: number;
    purchasedSince: number;
  }>
) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      const lastActive = await tx
        .select()
        .from(inventories)
        .where(eq(inventories.status, "active"))
        .orderBy(desc(inventories.createdAt))
        .limit(1);

      const activeInv = lastActive[0] ?? null;

      if (activeInv) {
        for (const item of items) {
          const drink = await tx
            .select()
            .from(drinks)
            .where(eq(drinks.id, item.drinkId))
            .limit(1);

          if (!drink[0]) continue;

          const soldSinceAgg = await tx
            .select({
              total: sql<number>`COALESCE(SUM(${orders.amount}), 0)`,
            })
            .from(orders)
            .where(
              and(
                eq(orders.drinkId, item.drinkId),
                gte(orders.createdAt, activeInv.createdAt)
              )
            );

          const soldSinceFinal = Number(soldSinceAgg[0]?.total || 0);

          const existingActiveItem = await tx
            .select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.inventoryId, activeInv.id),
                eq(inventoryItems.drinkId, item.drinkId)
              )
            )
            .limit(1);

          if (existingActiveItem[0]) {
            await tx
              .update(inventoryItems)
              .set({
                countedStock: item.countedStock,
                purchasedSince: item.purchasedSince,
                soldSince: soldSinceFinal,
              })
              .where(eq(inventoryItems.id, existingActiveItem[0].id));
          } else {
            const priorForBaseline = await tx
              .select()
              .from(inventoryItems)
              .innerJoin(
                inventories,
                eq(inventoryItems.inventoryId, inventories.id)
              )
              .where(eq(inventoryItems.drinkId, item.drinkId))
              .orderBy(desc(inventories.createdAt))
              .limit(1);

            const baselinePreviousStock =
              priorForBaseline[0]?.inventory_item.countedStock ?? 0;

            await tx.insert(inventoryItems).values({
              inventoryId: activeInv.id,
              drinkId: item.drinkId,
              previousStock: baselinePreviousStock,
              countedStock: item.countedStock,
              purchasedSince: item.purchasedSince,
              soldSince: soldSinceFinal,
              priceAtCount: drink[0].price,
            });
          }
        }

        await tx
          .update(inventories)
          .set({ status: "closed", closedAt: new Date() })
          .where(eq(inventories.id, activeInv.id));
      }

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

      for (const item of items) {
        const drink = await tx
          .select()
          .from(drinks)
          .where(eq(drinks.id, item.drinkId))
          .limit(1);

        if (!drink[0]) continue;

        let closingCounted: number | null = null;

        if (activeInv) {
          const justClosedItem = await tx
            .select()
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.inventoryId, activeInv.id),
                eq(inventoryItems.drinkId, item.drinkId)
              )
            )
            .limit(1);

          if (justClosedItem[0])
            closingCounted = justClosedItem[0].countedStock;
        }

        if (closingCounted === null) {
          const latestAny = await tx
            .select()
            .from(inventoryItems)
            .innerJoin(
              inventories,
              eq(inventoryItems.inventoryId, inventories.id)
            )
            .where(eq(inventoryItems.drinkId, item.drinkId))
            .orderBy(desc(inventories.createdAt))
            .limit(1);

          closingCounted = latestAny[0]?.inventory_item.countedStock ?? 0;
        }

        await tx.insert(inventoryItems).values({
          inventoryId: newInventory.id,
          drinkId: item.drinkId,
          previousStock: closingCounted,
          countedStock: closingCounted,
          purchasedSince: 0,
          soldSince: 0,
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

export async function saveQuickAdjustments(
  adjustments: Array<{
    drinkId: string;
    countedStock?: number;
    purchasedQuantity?: number;
  }>
) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    await db.transaction(async (tx) => {
      // Get the current active inventory
      const activeInventory = await tx
        .select()
        .from(inventories)
        .where(eq(inventories.status, "active"))
        .limit(1);

      if (!activeInventory[0]) {
        // Create a new active inventory if none exists
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

        // Initialize all drinks with zero stock
        const allDrinks = await tx.select().from(drinks);
        for (const drink of allDrinks) {
          await tx.insert(inventoryItems).values({
            inventoryId: newInventory.id,
            drinkId: drink.id,
            countedStock: 0,
            previousStock: 0,
            purchasedSince: 0,
            soldSince: 0,
            priceAtCount: drink.price,
          });
        }
      }

      const currentInventoryId = activeInventory[0]?.id;

      if (!currentInventoryId) {
        throw new Error("No active inventory found");
      }

      // Apply each adjustment
      for (const adjustment of adjustments) {
        if (
          adjustment.countedStock === undefined &&
          adjustment.purchasedQuantity === undefined
        ) {
          continue; // Skip if no changes
        }

        // Get current inventory item
        const currentItem = await tx
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.inventoryId, currentInventoryId),
              eq(inventoryItems.drinkId, adjustment.drinkId)
            )
          )
          .limit(1);

        if (!currentItem[0]) {
          // Create new item if it doesn't exist
          const drink = await tx
            .select()
            .from(drinks)
            .where(eq(drinks.id, adjustment.drinkId))
            .limit(1);

          if (drink[0]) {
            await tx.insert(inventoryItems).values({
              inventoryId: currentInventoryId,
              drinkId: adjustment.drinkId,
              countedStock: adjustment.countedStock || 0,
              previousStock: 0,
              purchasedSince: adjustment.purchasedQuantity || 0,
              soldSince: 0,
              priceAtCount: drink[0].price,
            });
          }
        } else {
          const updates: any = {};

          if (adjustment.countedStock !== undefined) {
            // Directly set the counted stock (Ist-Bestand)
            updates.countedStock = adjustment.countedStock;
          }

          if (adjustment.purchasedQuantity !== undefined) {
            // Add to purchasedSince without affecting countedStock
            updates.purchasedSince =
              currentItem[0].purchasedSince + adjustment.purchasedQuantity;
          }

          // Only update if there are changes
          if (Object.keys(updates).length > 0) {
            await tx
              .update(inventoryItems)
              .set(updates)
              .where(
                and(
                  eq(inventoryItems.inventoryId, currentInventoryId),
                  eq(inventoryItems.drinkId, adjustment.drinkId)
                )
              );
          }
        }
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Failed to save adjustments:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to save adjustments",
    };
  }
}
