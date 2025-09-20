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
        lastInventoryStock: inventoryItem.previousStock,
        purchasedSince: inventoryItem.purchasedSince,
        soldSince: soldCount,
        calculatedStock: Math.max(
          0,
          inventoryItem.previousStock + inventoryItem.purchasedSince - soldCount
        ),
        countedStock: inventoryItem.countedStock,
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

      const itemsWithDetails = items.map((item) => {
        const expectedStock = Math.max(
          0,
          item.inventoryItem.previousStock +
            item.inventoryItem.purchasedSince -
            item.inventoryItem.soldSince
        );

        const difference = item.inventoryItem.countedStock - expectedStock;

        return {
          drinkId: item.inventoryItem.drinkId,
          drinkName: item.drinkName,
          countedStock: item.inventoryItem.countedStock,
          expectedStock,
          difference,
          lossValue: item.inventoryItem.lossValue,
        };
      });

      return {
        id: inv.id,
        inventoryDate: inv.createdAt,
        status: inv.status,
        totalLosses: inv.totalLoss,
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

  let totalInventoryLoss = 0;

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
          const validatedCountedStock = Math.max(0, item.countedStock);
          const validatedPurchasedSince = Math.max(0, item.purchasedSince);

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

          let itemLoss = 0;
          if (existingActiveItem[0]) {
            const expectedStock = Math.max(
              0,
              existingActiveItem[0].previousStock +
                validatedPurchasedSince -
                soldSinceFinal
            );
            const difference = validatedCountedStock - expectedStock;
            if (difference < 0) {
              itemLoss = Math.abs(difference) * drink[0].price;
            }
            totalInventoryLoss += itemLoss;

            await tx
              .update(inventoryItems)
              .set({
                countedStock: validatedCountedStock,
                purchasedSince: validatedPurchasedSince,
                soldSince: soldSinceFinal,
                lossValue: itemLoss,
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

            const expectedStock = Math.max(
              0,
              baselinePreviousStock + validatedPurchasedSince - soldSinceFinal
            );
            const difference = validatedCountedStock - expectedStock;
            if (difference < 0) {
              itemLoss = Math.abs(difference) * drink[0].price;
            }
            totalInventoryLoss += itemLoss;

            await tx.insert(inventoryItems).values({
              inventoryId: activeInv.id,
              drinkId: item.drinkId,
              previousStock: Math.max(0, baselinePreviousStock),
              countedStock: validatedCountedStock,
              purchasedSince: validatedPurchasedSince,
              soldSince: soldSinceFinal,
              priceAtCount: drink[0].price,
              lossValue: itemLoss,
            });
          }
        }

        await tx
          .update(inventories)
          .set({
            status: "closed",
            closedAt: new Date(),
            totalLoss: totalInventoryLoss,
          })
          .where(eq(inventories.id, activeInv.id));
      }

      const [newInventory] = await tx
        .insert(inventories)
        .values({
          status: "active",
          performedBy: session.user.id,
          totalLoss: 0,
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

        const validatedCountedStock = Math.max(0, item.countedStock);

        await tx.insert(inventoryItems).values({
          inventoryId: newInventory.id,
          drinkId: item.drinkId,
          previousStock: validatedCountedStock,
          countedStock: validatedCountedStock,
          purchasedSince: 0,
          soldSince: 0,
          priceAtCount: drink[0].price,
          lossValue: 0,
        });
      }
    });

    return { success: true, totalInventoryLoss: totalInventoryLoss };
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
      const activeInventory = await tx
        .select()
        .from(inventories)
        .where(eq(inventories.status, "active"))
        .limit(1);

      if (!activeInventory[0]) {
        const [newInventory] = await tx
          .insert(inventories)
          .values({
            status: "active",
            performedBy: session.user.id,
            totalLoss: 0,
          })
          .returning();

        if (!newInventory) {
          throw new Error("Failed to create inventory");
        }

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
            lossValue: 0,
          });
        }
      }

      const currentInventoryId = activeInventory[0]?.id;

      if (!currentInventoryId) {
        throw new Error("No active inventory found");
      }

      for (const adjustment of adjustments) {
        if (
          adjustment.countedStock === undefined &&
          adjustment.purchasedQuantity === undefined
        ) {
          continue;
        }

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
          const drink = await tx
            .select()
            .from(drinks)
            .where(eq(drinks.id, adjustment.drinkId))
            .limit(1);

          if (drink[0]) {
            await tx.insert(inventoryItems).values({
              inventoryId: currentInventoryId,
              drinkId: adjustment.drinkId,
              countedStock: Math.max(0, adjustment.countedStock || 0),
              previousStock: 0,
              purchasedSince: Math.max(0, adjustment.purchasedQuantity || 0),
              soldSince: 0,
              priceAtCount: drink[0].price,
              lossValue: 0,
            });
          }
        } else {
          const updates: any = {};

          if (adjustment.countedStock !== undefined) {
            updates.countedStock = Math.max(0, adjustment.countedStock);
          }

          if (adjustment.purchasedQuantity !== undefined) {
            updates.purchasedSince = Math.max(
              0,
              currentItem[0].purchasedSince + adjustment.purchasedQuantity
            );
          }

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
