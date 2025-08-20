// createCSV.ts
"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "~/server/db/index";
import { billItems, billPeriods, bills, drinks } from "~/server/db/schema";

interface BillWithItems {
  id: string;
  userId: string;
  userName: string;
  status: string;
  oldBillingAmount: number;
  fees: number;
  drinksTotal: number;
  total: number;
  paidAt: Date | null;
  items: Array<{
    drinkName: string;
    amount: number;
    pricePerDrink: number;
    totalPricePerDrink: number;
  }>;
}

interface CSVGenerationResult {
  success: boolean;
  csvContent?: string;
  fileName?: string;
  error?: string;
  billCount?: number;
  drinkColumns?: string[];
}

/**
 * Generates a CSV for a specific bill period
 * @param billPeriodId - The ID of the bill period to generate CSV for
 * @param options - Optional configuration for CSV generation
 */
export async function generateBillPeriodCSV(
  billPeriodId: string,
  options?: {
    paypalBaseUrl?: string;
    delimiter?: string; // '\t' for tab, ';' for semicolon, ',' for comma
    includeEventBills?: boolean;
  }
): Promise<CSVGenerationResult> {
  try {
    const paypalBaseUrl =
      options?.paypalBaseUrl || "https://paypal.me/YourHandle";
    const delimiter = options?.delimiter || ","; // Changed default to comma
    const includeEventBills = options?.includeEventBills ?? true;

    // 1. Get the bill period information
    const [billPeriod] = await db
      .select()
      .from(billPeriods)
      .where(eq(billPeriods.id, billPeriodId))
      .limit(1);

    if (!billPeriod) {
      return {
        success: false,
        error: `Bill period with ID ${billPeriodId} not found`,
      };
    }

    // 2. Get all available drinks from the database to use as columns
    const allDrinks = await db
      .select({
        name: drinks.name,
      })
      .from(drinks)
      .orderBy(drinks.name);

    const drinkColumns = allDrinks.map((d) => d.name);

    // Optionally filter out event bills
    const whereConditions = and(
      eq(bills.billPeriodId, billPeriodId),
      sql`${bills.userId} NOT LIKE 'event-%'`
    );

    const billsData = await db
      .select()
      .from(bills)
      .where(whereConditions)
      .orderBy(bills.userName);

    if (billsData.length === 0) {
      return {
        success: false,
        error: `No bills found for bill period ${billPeriodId}`,
      };
    }

    // 4. Get all bill items for these bills
    const billIds = billsData.map((b) => b.id);
    const billItemsData = await db
      .select()
      .from(billItems)
      .where(
        sql`${billItems.billId} IN (${sql.join(
          billIds.map((id) => sql`${id}`),
          sql`, `
        )})`
      );

    // 5. Group items by bill ID
    const itemsByBillId: Record<string, typeof billItemsData> = {};
    billItemsData.forEach((item) => {
      if (!itemsByBillId[item.billId]) {
        itemsByBillId[item.billId] = [];
      }
      itemsByBillId[item.billId]!.push(item);
    });

    // 6. Prepare bills with their items
    const billsWithItems: BillWithItems[] = billsData.map((bill) => ({
      ...bill,
      items: itemsByBillId[bill.id] || [],
    }));

    // 7. Generate CSV content
    const csvContent = generateCSVContent(
      billsWithItems,
      drinkColumns,
      billPeriod.billNumber,
      {
        paypalBaseUrl,
        delimiter,
      }
    );

    // 8. Generate filename
    const fileName = `Rechnung_${billPeriod.billNumber}_${
      new Date().toISOString().split("T")[0]
    }.csv`;

    return {
      success: true,
      csvContent,
      fileName,
      billCount: billsWithItems.length,
      drinkColumns,
    };
  } catch (error) {
    console.error("Error generating CSV:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error generating CSV",
    };
  }
}

/**
 * Escapes a CSV field value by wrapping in quotes and escaping internal quotes
 */
function escapeCSVField(value: string, delimiter: string): string {
  // If the value contains the delimiter, quotes, or newlines, we need to escape it
  if (
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    // Escape quotes by doubling them
    const escapedValue = value.replace(/"/g, '""');
    // Wrap in quotes
    return `"${escapedValue}"`;
  }
  return value;
}

/**
 * Internal function to generate the actual CSV content
 */
function generateCSVContent(
  bills: BillWithItems[],
  drinkColumns: string[],
  billNumber: number,
  options: {
    paypalBaseUrl: string;
    delimiter: string;
  }
): string {
  const { paypalBaseUrl, delimiter } = options;

  // Create header row with proper escaping
  const headers = [
    "Name",
    ...drinkColumns,
    "Rechnungsbetrag",
    "Alte Rechnung",
    "Mahnung",
    "Zu zahlender Betrag",
    "nix",
    "Mahnfaktor",
    "PayPal Link",
    'Wenn Bezahlt "Bezahlt" eintragen',
  ];

  // Escape header fields
  const escapedHeaders = headers.map((header) =>
    escapeCSVField(header, delimiter)
  );

  // Process each bill into a CSV row
  const rows: string[][] = bills.map((bill) => {
    // Create a map of drink totals for this bill
    const drinkTotals: Record<string, number> = {};

    // Aggregate drinks from bill items
    bill.items.forEach((item) => {
      if (drinkTotals[item.drinkName]) {
        drinkTotals[item.drinkName]! += item.totalPricePerDrink;
      } else {
        drinkTotals[item.drinkName] = item.totalPricePerDrink;
      }
    });

    // Build the row data
    const row: string[] = [
      escapeCSVField(bill.userName, delimiter), // Name
    ];

    // Add drink columns (in the exact order as in the database)
    drinkColumns.forEach((drinkName) => {
      const amount = drinkTotals[drinkName] || 0;
      row.push(escapeCSVField(formatCurrency(amount), delimiter));
    });

    // Calculate Mahnfaktor (late fee percentage)
    const mahnfaktor =
      bill.drinksTotal > 0 ? (bill.fees / bill.drinksTotal) * 100 : 0;

    // Add billing summary columns
    row.push(escapeCSVField(formatCurrency(bill.drinksTotal), delimiter)); // Rechnungsbetrag
    row.push(escapeCSVField(formatCurrency(bill.oldBillingAmount), delimiter)); // Alte Rechnung
    row.push(escapeCSVField(formatCurrency(bill.fees), delimiter)); // Mahnung
    row.push(escapeCSVField(formatCurrency(bill.total), delimiter)); // Zu zahlender Betrag
    row.push(escapeCSVField(bill.userName, delimiter)); // nix (using userName as identifier)
    row.push(escapeCSVField(formatPercentage(mahnfaktor), delimiter)); // Mahnfaktor

    // Generate PayPal link if amount > 0 and not paid
    const paypalLink =
      bill.total > 0 && bill.status !== "Bezahlt"
        ? `${paypalBaseUrl}/${bill.total.toFixed(2)}EUR`
        : "#####";
    row.push(escapeCSVField(paypalLink, delimiter));

    // Payment status
    const paymentStatus = bill.status === "Bezahlt" ? "Bezahlt" : "";
    row.push(escapeCSVField(paymentStatus, delimiter));

    return row;
  });

  // Add summary row at the bottom
  const totalRow = createSummaryRow(bills, drinkColumns, delimiter);
  rows.push(totalRow);

  // Convert to CSV format
  const csvContent = [
    escapedHeaders.join(delimiter),
    ...rows.map((row) => row.join(delimiter)),
  ].join("\n");

  return csvContent;
}

/**
 * Creates the summary row with totals
 */
function createSummaryRow(
  bills: BillWithItems[],
  drinkColumns: string[],
  delimiter: string
): string[] {
  const totalRow: string[] = [escapeCSVField("GESAMT", delimiter)];

  // Calculate totals for each drink column
  drinkColumns.forEach((drinkName) => {
    const total = bills.reduce((sum, bill) => {
      const drinkTotal = bill.items
        .filter((item) => item.drinkName === drinkName)
        .reduce((drinkSum, item) => drinkSum + item.totalPricePerDrink, 0);
      return sum + drinkTotal;
    }, 0);
    totalRow.push(escapeCSVField(formatCurrency(total), delimiter));
  });

  // Add summary totals
  const totalDrinks = bills.reduce((sum, bill) => sum + bill.drinksTotal, 0);
  const totalOldBilling = bills.reduce(
    (sum, bill) => sum + bill.oldBillingAmount,
    0
  );
  const totalFees = bills.reduce((sum, bill) => sum + bill.fees, 0);
  const grandTotal = bills.reduce((sum, bill) => sum + bill.total, 0);

  totalRow.push(escapeCSVField(formatCurrency(totalDrinks), delimiter)); // Total Rechnungsbetrag
  totalRow.push(escapeCSVField(formatCurrency(totalOldBilling), delimiter)); // Total Alte Rechnung
  totalRow.push(escapeCSVField(formatCurrency(totalFees), delimiter)); // Total Mahnung
  totalRow.push(escapeCSVField(formatCurrency(grandTotal), delimiter)); // Total Zu zahlender Betrag
  totalRow.push(escapeCSVField("", delimiter)); // nix
  totalRow.push(escapeCSVField("", delimiter)); // Mahnfaktor
  totalRow.push(escapeCSVField("", delimiter)); // PayPal Link
  totalRow.push(escapeCSVField("", delimiter)); // Bezahlt status

  return totalRow;
}

/**
 * Helper function to format currency for German locale
 */
function formatCurrency(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " EUR";
}

/**
 * Helper function to format percentage for German locale
 */
function formatPercentage(value: number): string {
  return value.toFixed(2).replace(".", ",") + " %";
}
