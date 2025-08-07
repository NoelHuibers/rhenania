"use server";

import { desc, eq, sql } from "drizzle-orm";
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
  try {
    console.log("Starting billing process...");

    const result = await db.transaction(async (tx) => {
      // 1. Get all orders that haven't been billed yet
      const unbilledOrders = await tx
        .select()
        .from(orders)
        .where(eq(orders.inBill, false))
        .orderBy(orders.userId, orders.createdAt);

      if (unbilledOrders.length === 0) {
        console.log("No unbilled orders found");
        return {
          success: true,
          message: "Keine unbezahlten Bestellungen gefunden",
          billsCreated: 0,
          totalAmount: 0,
        };
      }

      console.log(`Found ${unbilledOrders.length} unbilled orders`);

      // 2. Get the next bill number
      const [lastBillPeriod] = await tx
        .select({ billNumber: billPeriods.billNumber })
        .from(billPeriods)
        .orderBy(desc(billPeriods.billNumber))
        .limit(1);

      const nextBillNumber = (lastBillPeriod?.billNumber ?? -1) + 1;

      // 3. Create the new bill period
      const now = new Date();
      const billPeriodId = crypto.randomUUID();

      await tx.insert(billPeriods).values({
        id: billPeriodId,
        billNumber: nextBillNumber,
        totalAmount: 0, // Will be updated later
        createdAt: now,
      });

      console.log(
        `Created bill period ${nextBillNumber} (ID: ${billPeriodId})`
      );

      // 4. Group orders by user
      const userOrderMap = new Map<string, OrderWithDetails[]>();

      for (const order of unbilledOrders) {
        const userId = order.userId;
        if (!userOrderMap.has(userId)) {
          userOrderMap.set(userId, []);
        }
        userOrderMap.get(userId)!.push(order);
      }

      console.log(`Processing bills for ${userOrderMap.size} users`);

      // 5. Process each user's billing
      const userBillingSummaries: UserBillingSummary[] = [];
      const createdBills: string[] = [];
      let totalBillingAmount = 0;

      for (const [userId, userOrders] of userOrderMap.entries()) {
        const userName =
          userOrders.length > 0 ? userOrders[0]?.userName ?? "" : "";

        // Calculate totals for this user
        const drinksTotal = userOrders.reduce(
          (sum, order) => sum + order.total,
          0
        );

        // TODO: Get any previous outstanding balance from unpaid bills
        const oldBillingAmount = 0;

        // TODO: Calculate any fees (late fees, service charges, etc.)
        const fees = 0;

        const finalTotal = drinksTotal + oldBillingAmount + fees;

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

      // 6. Update the bill period with total amount
      await tx
        .update(billPeriods)
        .set({
          totalAmount: totalBillingAmount,
          updatedAt: now,
        })
        .where(eq(billPeriods.id, billPeriodId));

      // 7. Mark all processed orders as billed
      const orderIds = unbilledOrders.map((order) => order.id);

      await tx
        .update(orders)
        .set({
          inBill: true,
          updatedAt: now,
        })
        .where(
          sql`${orders.id} IN (${sql.join(
            orderIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        );

      console.log(`Marked ${orderIds.length} orders as billed`);

      return {
        success: true,
        message: `Erfolgreich ${createdBills.length} Rechnungen erstellt`,
        billPeriod: {
          id: billPeriodId,
          billNumber: nextBillNumber,
        },
        billsCreated: createdBills.length,
        totalAmount: totalBillingAmount,
        userSummaries: userBillingSummaries,
        createdBillIds: createdBills,
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

// Get billing statistics
export async function getBillingStatistics() {
  try {
    const [unbilledCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.inBill, false));

    const [unbilledTotal] = await db
      .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
      .from(orders)
      .where(eq(orders.inBill, false));

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
      totalBillPeriods: totalPeriods?.count ?? 0,
      pendingBillsAmount: pendingBillsTotal?.total ?? 0,
    };
  } catch (error) {
    console.error("Error getting billing statistics:", error);
    return null;
  }
}
