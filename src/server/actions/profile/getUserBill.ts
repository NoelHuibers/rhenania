"use server";

import { and, desc, eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { billItems, billPeriods, bills } from "~/server/db/schema";

export type BillData = {
  status: "Bezahlt" | "Unbezahlt" | "Gestundet";
  total: number;
  drinksTotal: number;
  fees: number;
  oldBalance: number;
  billNumber: string;
  lastUpdated: string;
  billId: string;
};

export type BillItem = {
  item: string;
  quantity: number;
  price: number;
  total: number;
};

export async function getUserBillingData(): Promise<{
  billData: BillData | null;
  billItems: BillItem[];
}> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("User must be authenticated to view billing data");
  }

  try {
    // Get the user's most recent bill
    const userBills = await db
      .select({
        bill: bills,
        billPeriod: billPeriods,
      })
      .from(bills)
      .leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
      .where(eq(bills.userId, session.user.id))
      .orderBy(desc(bills.createdAt))
      .limit(1);

    if (userBills.length === 0) {
      return {
        billData: null,
        billItems: [],
      };
    }

    const userBill = userBills[0]!;
    const bill = userBill.bill;
    const billPeriod = userBill.billPeriod;

    // Get bill items for this bill
    const items = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, bill.id));

    // Transform data to match the component's expected format
    const billData: BillData = {
      status: bill.status,
      total: bill.total,
      drinksTotal: bill.drinksTotal,
      fees: bill.fees,
      oldBalance: bill.oldBillingAmount,
      billNumber: billPeriod?.billNumber?.toString() ?? "N/A",
      lastUpdated:
        (bill.updatedAt?.toISOString().split("T")[0] ??
          bill.createdAt.toISOString().split("T")[0]) ||
        "",
      billId: bill.id,
    };

    const transformedBillItems: BillItem[] = items.map((item) => ({
      item: item.drinkName,
      quantity: item.amount,
      price: item.pricePerDrink,
      total: item.totalPricePerDrink,
    }));

    // Add fees as a separate item if they exist
    if (bill.fees > 0) {
      transformedBillItems.push({
        item: "Service Fee",
        quantity: 1,
        price: bill.fees,
        total: bill.fees,
      });
    }

    return {
      billData,
      billItems: transformedBillItems,
    };
  } catch (error) {
    console.error("Error fetching billing data:", error);
    throw new Error("Failed to fetch billing data");
  }
}

export async function getAllUserBills(): Promise<
  Array<{
    billData: BillData;
    billItems: BillItem[];
  }>
> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("User must be authenticated to view billing data");
  }

  try {
    // Get all user's bills
    const userBills = await db
      .select({
        bill: bills,
        billPeriod: billPeriods,
      })
      .from(bills)
      .leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
      .where(eq(bills.userId, session.user.id))
      .orderBy(desc(bills.createdAt));

    const allBills = [];

    for (const userBill of userBills) {
      const bill = userBill.bill;
      const billPeriod = userBill.billPeriod;

      // Get bill items for this bill
      const items = await db
        .select()
        .from(billItems)
        .where(eq(billItems.billId, bill.id));

      const billData: BillData = {
        status: bill.status,
        total: bill.total,
        drinksTotal: bill.drinksTotal,
        fees: bill.fees,
        oldBalance: bill.oldBillingAmount,
        billNumber: billPeriod?.billNumber?.toString() ?? "N/A",
        lastUpdated:
          bill.updatedAt?.toISOString().split("T")[0] ??
          bill.createdAt.toISOString().split("T")[0] ??
          "",
        billId: bill.id,
      };

      const transformedBillItems: BillItem[] = items.map((item) => ({
        item: item.drinkName,
        quantity: item.amount,
        price: item.pricePerDrink,
        total: item.totalPricePerDrink,
      }));

      // Add fees as a separate item if they exist
      if (bill.fees > 0) {
        transformedBillItems.push({
          item: "Service Fee",
          quantity: 1,
          price: bill.fees,
          total: bill.fees,
        });
      }

      allBills.push({
        billData,
        billItems: transformedBillItems,
      });
    }

    return allBills;
  } catch (error) {
    console.error("Error fetching all bills:", error);
    throw new Error("Failed to fetch billing data");
  }
}

// Optional: Get bill by specific ID
export async function getBillById(billId: string): Promise<{
  billData: BillData | null;
  billItems: BillItem[];
}> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("User must be authenticated to view billing data");
  }

  try {
    const userBills = await db
      .select({
        bill: bills,
        billPeriod: billPeriods,
      })
      .from(bills)
      .leftJoin(billPeriods, eq(bills.billPeriodId, billPeriods.id))
      .where(and(eq(bills.id, billId), eq(bills.userId, session.user.id)))
      .limit(1);

    if (userBills.length === 0) {
      return {
        billData: null,
        billItems: [],
      };
    }

    const userBill = userBills[0]!;
    const bill = userBill.bill;
    const billPeriod = userBill.billPeriod;

    const items = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, bill.id));

    const billData: BillData = {
      status: bill.status,
      total: bill.total,
      drinksTotal: bill.drinksTotal,
      fees: bill.fees,
      oldBalance: bill.oldBillingAmount,
      billNumber: billPeriod?.billNumber?.toString() ?? "N/A",
      lastUpdated:
        bill.updatedAt?.toISOString().split("T")[0] ??
        bill.createdAt.toISOString().split("T")[0] ??
        "",
      billId: bill.id,
    };

    const transformedBillItems: BillItem[] = items.map((item) => ({
      item: item.drinkName,
      quantity: item.amount,
      price: item.pricePerDrink,
      total: item.totalPricePerDrink,
    }));

    if (bill.fees > 0) {
      transformedBillItems.push({
        item: "Service Fee",
        quantity: 1,
        price: bill.fees,
        total: bill.fees,
      });
    }

    return {
      billData,
      billItems: transformedBillItems,
    };
  } catch (error) {
    console.error("Error fetching bill by ID:", error);
    throw new Error("Failed to fetch billing data");
  }
}
