"use server";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { billItems, billPeriods, bills, orders } from "~/server/db/schema";

interface OrderWithDetails {
  id: string;
  userId: string;
  userName: string;
  drinkId: string;
  drinkName: string;
  amount: number;
  pricePerUnit: number;
  total: number;
  createdAt: Date;
  bookingFor: string | null;
}

interface UserBillingSummary {
  userId: string;
  userName: string;
  orders: OrderWithDetails[];
  drinksTotal: number;
  oldBillingAmount: number;
  fees: number;
  finalTotal: number;
}

export async function createNewBilling() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("User must be authenticated to view billing data");
  }

  const createdByUserId = session.user.id;

  try {
    console.log("Starting billing process...");

    const result = await db.transaction(async (tx) => {
      // 1. Get all unbilled orders (both personal and event)
      const allUnbilledOrders = await tx
        .select()
        .from(orders)
        .where(eq(orders.inBill, false))
        .orderBy(orders.userId, orders.createdAt);

      if (allUnbilledOrders.length === 0) {
        console.log("No unbilled orders found");
        return {
          success: true,
          message: "Keine unbezahlten Bestellungen gefunden",
          billsCreated: 0,
          totalAmount: 0,
          eventBillsCreated: 0,
        };
      }

      // Separate personal and event orders
      const personalOrders = allUnbilledOrders.filter(
        (order) => !order.bookingFor
      );
      const eventOrders = allUnbilledOrders.filter((order) => order.bookingFor);

      console.log(`Found ${personalOrders.length} unbilled personal orders`);
      console.log(`Found ${eventOrders.length} event orders to process`);

      // 2. Get the next bill number and close the previous bill period
      const [lastBillPeriod] = await tx
        .select({
          id: billPeriods.id,
          billNumber: billPeriods.billNumber,
          closedAt: billPeriods.closedAt,
        })
        .from(billPeriods)
        .orderBy(desc(billPeriods.billNumber))
        .limit(1);

      const nextBillNumber = (lastBillPeriod?.billNumber ?? -1) + 1;
      const now = new Date();

      // Close the previous bill period if it's not already closed
      if (lastBillPeriod && !lastBillPeriod.closedAt) {
        await tx
          .update(billPeriods)
          .set({
            closedAt: now,
            updatedAt: now,
          })
          .where(eq(billPeriods.id, lastBillPeriod.id));

        console.log(`Closed previous bill period ${lastBillPeriod.billNumber}`);
      }

      // 3. Create the new bill period
      const billPeriodId = crypto.randomUUID();

      await tx.insert(billPeriods).values({
        id: billPeriodId,
        billNumber: nextBillNumber,
        totalAmount: 0, // Will be updated later
        createdBy: createdByUserId,
        createdAt: now,
      });

      console.log(
        `Created bill period ${nextBillNumber} (ID: ${billPeriodId}) by user ${createdByUserId}`
      );

      // 4. Get unpaid amounts from previous bills for each user
      const unpaidAmounts = await tx
        .select({
          userId: bills.userId,
          totalUnpaid: sql<number>`sum(${bills.total})`.as("totalUnpaid"),
        })
        .from(bills)
        .where(
          and(
            eq(bills.status, "Unbezahlt"),
            // Only include bills from previous periods (not the current one we just created)
            sql`${bills.billPeriodId} != ${billPeriodId}`
          )
        )
        .groupBy(bills.userId);

      const unpaidAmountMap = new Map<string, number>();
      unpaidAmounts.forEach((row) => {
        unpaidAmountMap.set(row.userId, Number(row.totalUnpaid) || 0);
      });

      console.log(`Found unpaid amounts for ${unpaidAmountMap.size} users`);

      // 5. Process personal orders - Group by user
      const userOrderMap = new Map<string, OrderWithDetails[]>();
      for (const order of personalOrders) {
        const userId = order.userId;
        if (!userOrderMap.has(userId)) {
          userOrderMap.set(userId, []);
        }
        userOrderMap.get(userId)!.push(order);
      }

      console.log(`Processing bills for ${userOrderMap.size} users`);

      // 6. Process event orders - Group by event name (bookingFor)
      const eventOrderMap = new Map<string, OrderWithDetails[]>();
      for (const order of eventOrders) {
        const eventName = order.bookingFor || "Unknown Event";
        if (!eventOrderMap.has(eventName)) {
          eventOrderMap.set(eventName, []);
        }
        eventOrderMap.get(eventName)!.push(order);
      }

      console.log(`Processing bills for ${eventOrderMap.size} events`);

      // 7. Process each user's billing
      const userBillingSummaries: UserBillingSummary[] = [];
      const createdBills: string[] = [];
      const createdEventBills: string[] = [];
      let totalBillingAmount = 0;

      // Process personal bills
      for (const [userId, userOrders] of userOrderMap.entries()) {
        const userName =
          userOrders.length > 0 ? userOrders[0]?.userName ?? "" : "";

        // Calculate totals for this user
        const drinksTotal = userOrders.reduce(
          (sum, order) => sum + order.total,
          0
        );

        // Get previous outstanding balance from unpaid bills
        const oldBillingAmount = unpaidAmountMap.get(userId) || 0;

        // TODO: Calculate any fees (late fees, service charges, etc.)
        const fees = 0;

        // Calculate any additional fees (late fees, service charges, etc.)
        const finalTotal = drinksTotal + fees;

        // Create the bill
        const billId = crypto.randomUUID();

        await tx.insert(bills).values({
          id: billId,
          billPeriodId: billPeriodId,
          userId: userId,
          userName: userName,
          status: "Unbezahlt",
          oldBillingAmount: oldBillingAmount,
          fees: fees,
          drinksTotal: drinksTotal,
          total: finalTotal,
          createdAt: now,
        });

        console.log(
          `Created bill ${billId} for user ${userName} with total €${finalTotal.toFixed(
            2
          )} (drinks: €${drinksTotal.toFixed(
            2
          )}, old billing: €${oldBillingAmount.toFixed(2)})`
        );

        // Group orders by drink to consolidate quantities
        const drinkSummary = new Map<
          string,
          {
            drinkName: string;
            totalAmount: number;
            pricePerUnit: number;
            totalPrice: number;
          }
        >();

        for (const order of userOrders) {
          const key = `${order.drinkName}-${order.pricePerUnit}`;

          if (drinkSummary.has(key)) {
            const existing = drinkSummary.get(key)!;
            existing.totalAmount += order.amount;
            existing.totalPrice += order.total;
          } else {
            drinkSummary.set(key, {
              drinkName: order.drinkName,
              totalAmount: order.amount,
              pricePerUnit: order.pricePerUnit,
              totalPrice: order.total,
            });
          }
        }

        // Create bill items for each unique drink
        for (const drinkInfo of drinkSummary.values()) {
          await tx.insert(billItems).values({
            id: crypto.randomUUID(),
            billId: billId,
            drinkName: drinkInfo.drinkName,
            amount: drinkInfo.totalAmount,
            pricePerDrink: drinkInfo.pricePerUnit,
            totalPricePerDrink: drinkInfo.totalPrice,
            createdAt: now,
          });
        }

        // Store summary for return data
        userBillingSummaries.push({
          userId,
          userName,
          orders: userOrders,
          drinksTotal,
          oldBillingAmount,
          fees,
          finalTotal,
        });

        createdBills.push(billId);
        totalBillingAmount += finalTotal;
      }

      // 8. Process event bills - Create one bill per event
      for (const [eventName, eventOrdersList] of eventOrderMap.entries()) {
        // Calculate totals for this event
        const drinksTotal = eventOrdersList.reduce(
          (sum, order) => sum + order.total,
          0
        );

        const finalTotal = drinksTotal; // Events don't have old billing or fees

        // Create the event bill with special userId to mark it as an event
        const billId = crypto.randomUUID();
        const eventUserId = `event-${eventName
          .toLowerCase()
          .replace(/\s+/g, "-")}`;

        await tx.insert(bills).values({
          id: billId,
          billPeriodId: billPeriodId,
          userId: eventUserId, // Special ID format for events
          userName: `${eventName}`, // Event name with emoji prefix
          status: "Unbezahlt",
          oldBillingAmount: 0,
          fees: 0,
          drinksTotal: drinksTotal,
          total: finalTotal,
          createdAt: now,
        });

        console.log(
          `Created event bill ${billId} for "${eventName}" with total €${finalTotal.toFixed(
            2
          )}`
        );

        // Group orders by drink to consolidate quantities
        const drinkSummary = new Map<
          string,
          {
            drinkName: string;
            totalAmount: number;
            pricePerUnit: number;
            totalPrice: number;
          }
        >();

        for (const order of eventOrdersList) {
          const key = `${order.drinkName}-${order.pricePerUnit}`;

          if (drinkSummary.has(key)) {
            const existing = drinkSummary.get(key)!;
            existing.totalAmount += order.amount;
            existing.totalPrice += order.total;
          } else {
            drinkSummary.set(key, {
              drinkName: order.drinkName,
              totalAmount: order.amount,
              pricePerUnit: order.pricePerUnit,
              totalPrice: order.total,
            });
          }
        }

        // Create bill items for each unique drink
        for (const drinkInfo of drinkSummary.values()) {
          await tx.insert(billItems).values({
            id: crypto.randomUUID(),
            billId: billId,
            drinkName: drinkInfo.drinkName,
            amount: drinkInfo.totalAmount,
            pricePerDrink: drinkInfo.pricePerUnit,
            totalPricePerDrink: drinkInfo.totalPrice,
            createdAt: now,
          });
        }

        createdEventBills.push(billId);
        totalBillingAmount += finalTotal;
      }

      // 9. Update the bill period with total amount
      await tx
        .update(billPeriods)
        .set({
          totalAmount: totalBillingAmount,
          updatedAt: now,
        })
        .where(eq(billPeriods.id, billPeriodId));

      // 10. Mark all processed orders as billed
      const allOrderIds = allUnbilledOrders.map((order) => order.id);

      if (allOrderIds.length > 0) {
        await tx
          .update(orders)
          .set({
            inBill: true,
            updatedAt: now,
          })
          .where(
            sql`${orders.id} IN (${sql.join(
              allOrderIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );

        console.log(`Marked ${allOrderIds.length} orders as processed`);
      }

      return {
        success: true,
        message: `Erfolgreich ${
          createdBills.length + createdEventBills.length
        } Rechnungen erstellt`,
        billPeriod: {
          id: billPeriodId,
          billNumber: nextBillNumber,
        },
        billsCreated: createdBills.length,
        eventBillsCreated: createdEventBills.length,
        totalAmount: totalBillingAmount,
        userSummaries: userBillingSummaries,
        createdBillIds: [...createdBills, ...createdEventBills],
      };
    });

    console.log("Billing process completed successfully:", result);
    return result;
  } catch (error) {
    console.error("Error creating billing:", error);

    return {
      success: false,
      message: "Fehler beim Erstellen der Rechnungen",
      error: error instanceof Error ? error.message : "Unbekannter Fehler",
      billsCreated: 0,
      totalAmount: 0,
    };
  }
}

// Get the latest bill period
export async function getLatestBillPeriod() {
  try {
    const [latestPeriod] = await db
      .select()
      .from(billPeriods)
      .orderBy(desc(billPeriods.billNumber))
      .limit(1);

    return latestPeriod || null;
  } catch (error) {
    console.error("Error getting latest bill period:", error);
    return null;
  }
}

// Get all bill periods (for displaying tabs)
export async function getAllBillPeriods() {
  try {
    const periods = await db
      .select()
      .from(billPeriods)
      .orderBy(desc(billPeriods.billNumber));

    return periods;
  } catch (error) {
    console.error("Error getting bill periods:", error);
    return [];
  }
}

// Get bills for a specific period
export async function getBillsForPeriod(billPeriodId: string) {
  try {
    const billsData = await db
      .select({
        id: bills.id,
        userId: bills.userId,
        userName: bills.userName,
        status: bills.status,
        oldBillingAmount: bills.oldBillingAmount,
        fees: bills.fees,
        drinksTotal: bills.drinksTotal,
        total: bills.total,
        createdAt: bills.createdAt,
        paidAt: bills.paidAt,
      })
      .from(bills)
      .where(eq(bills.billPeriodId, billPeriodId))
      .orderBy(bills.userName);

    // Get bill items for each bill
    const billsWithItems = await Promise.all(
      billsData.map(async (bill) => {
        const items = await db
          .select()
          .from(billItems)
          .where(eq(billItems.billId, bill.id));

        return {
          id: bill.id,
          name: bill.userName,
          totalDue: bill.total,
          status: bill.status,
          oldBillingAmount: bill.oldBillingAmount,
          drinksTotal: bill.drinksTotal,
          fees: bill.fees,
          items: items.map((item) => ({
            id: item.id,
            name: item.drinkName,
            quantity: item.amount,
            unitPrice: item.pricePerDrink,
            subtotal: item.totalPricePerDrink,
          })),
        };
      })
    );

    return billsWithItems;
  } catch (error) {
    console.error("Error getting bills for period:", error);
    return [];
  }
}

// Close/finalize a billing period
export async function closeBillPeriod(billPeriodId: string) {
  try {
    const now = new Date();

    await db
      .update(billPeriods)
      .set({
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(billPeriods.id, billPeriodId));

    return {
      success: true,
      message: "Abrechnungsperiode erfolgreich abgeschlossen",
    };
  } catch (error) {
    console.error("Error closing bill period:", error);
    return {
      success: false,
      message: "Fehler beim Abschließen der Abrechnungsperiode",
    };
  }
}

// Update bill status
export async function updateBillStatus(
  billId: string,
  newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet"
) {
  try {
    const now = new Date();
    const updateData: any = {
      status: newStatus,
      updatedAt: now,
    };

    // Set paidAt if marking as paid
    if (newStatus === "Bezahlt") {
      updateData.paidAt = now;
    } else if (newStatus === "Unbezahlt" || newStatus === "Gestundet") {
      updateData.paidAt = null;
    }

    await db.update(bills).set(updateData).where(eq(bills.id, billId));

    return { success: true };
  } catch (error) {
    console.error("Error updating bill status:", error);
    return { success: false };
  }
}

// Get billing statistics (updated to include detailed event breakdown)
export async function getBillingStatistics() {
  try {
    const [unbilledCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.inBill, false),
          isNull(orders.bookingFor) // Only count personal orders
        )
      );

    const [unbilledTotal] = await db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(
        and(
          eq(orders.inBill, false),
          isNull(orders.bookingFor) // Only sum personal orders
        )
      );

    // Get detailed event orders grouped by event name
    const eventOrdersGrouped = await db
      .select({
        eventName: orders.bookingFor,
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`sum(${orders.total})`,
        bookedBy: sql<string>`GROUP_CONCAT(DISTINCT ${orders.userName})`,
      })
      .from(orders)
      .where(
        and(eq(orders.inBill, false), sql`${orders.bookingFor} IS NOT NULL`)
      )
      .groupBy(orders.bookingFor);

    // Calculate totals for all event orders
    const eventOrdersTotals = eventOrdersGrouped.reduce(
      (acc, event) => ({
        count: acc.count + Number(event.count),
        totalAmount: acc.totalAmount + Number(event.totalAmount),
      }),
      { count: 0, totalAmount: 0 }
    );

    const [totalPeriods] = await db
      .select({ count: sql<number>`count(*)` })
      .from(billPeriods);

    const [pendingBillsTotal] = await db
      .select({ total: sql<number>`coalesce(sum(${bills.total}), 0)` })
      .from(bills)
      .where(eq(bills.status, "Unbezahlt"));

    return {
      unbilledOrders: {
        count: unbilledCount?.count ?? 0,
        totalAmount: unbilledTotal?.total ?? 0,
      },
      eventOrders: {
        count: eventOrdersTotals.count,
        totalAmount: eventOrdersTotals.totalAmount,
        events: eventOrdersGrouped.map((event) => ({
          name: event.eventName || "Unknown Event",
          orderCount: Number(event.count),
          totalAmount: Number(event.totalAmount),
          bookedBy: event.bookedBy?.split(",") || [],
        })),
      },
      totalBillPeriods: totalPeriods?.count ?? 0,
      pendingBillsAmount: pendingBillsTotal?.total ?? 0,
    };
  } catch (error) {
    console.error("Error getting billing statistics:", error);
    return null;
  }
}

// Get event orders (orders with bookingFor set) - useful for tracking
export async function getEventOrders() {
  try {
    const eventOrders = await db
      .select()
      .from(orders)
      .where(sql`${orders.bookingFor} IS NOT NULL`)
      .orderBy(desc(orders.createdAt));

    return eventOrders;
  } catch (error) {
    console.error("Error getting event orders:", error);
    return [];
  }
}
