// createCSV.ts
"use server";

import { eq, sql } from "drizzle-orm";
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
 * Sorts bills to ensure event bills appear first
 * @param bills - Array of bills to sort
 * @returns Sorted array with events first, then regular users
 */
function sortBillsWithEventsFirst(bills: BillWithItems[]): BillWithItems[] {
  // Separate events and regular users
  const eventBills: BillWithItems[] = [];
  const regularBills: BillWithItems[] = [];

  bills.forEach((bill) => {
    if (bill.userId.startsWith("event-")) {
      eventBills.push(bill);
    } else {
      regularBills.push(bill);
    }
  });

  // Sort events by name (optional - you can customize this)
  eventBills.sort((a, b) => a.userName.localeCompare(b.userName));

  // Sort regular bills by name
  regularBills.sort((a, b) => a.userName.localeCompare(b.userName));

  // Combine with events first
  return [...eventBills, ...regularBills];
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
  }
): Promise<CSVGenerationResult> {
  try {
    const paypalBaseUrl =
      options?.paypalBaseUrl || "https://paypal.me/YourHandle";
    const delimiter = options?.delimiter || ",";

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

    // 2. Get all available drinks from the database with their prices
    const allDrinks = await db
      .select({
        name: drinks.name,
        price: drinks.price,
      })
      .from(drinks)
      .orderBy(drinks.name);

    const drinkColumns = allDrinks.map((d) => d.name);
    const drinkPrices: Record<string, number> = {};
    allDrinks.forEach((d) => {
      drinkPrices[d.name] = d.price;
    });

    const billsData = await db
      .select()
      .from(bills)
      .where(eq(bills.billPeriodId, billPeriodId));
    // Removed orderBy here since we'll sort later

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

    // 7. Sort bills with events first
    const sortedBills = sortBillsWithEventsFirst(billsWithItems);

    // 8. Generate CSV content
    const csvContent = generateCSVContent(
      sortedBills,
      drinkColumns,
      drinkPrices,
      billPeriod.billNumber,
      {
        paypalBaseUrl,
        delimiter,
      }
    );

    const fileName = `Rechnung_${billPeriod.billNumber}.csv`;

    return {
      success: true,
      csvContent,
      fileName,
      billCount: sortedBills.length,
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
  drinkPrices: Record<string, number>,
  billNumber: string,
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

  // Track total quantities for each drink
  const totalQuantities: Record<string, number> = {};
  drinkColumns.forEach((drink) => {
    totalQuantities[drink] = 0;
  });

  // Process each bill into a CSV row
  const rows: string[][] = bills.map((bill) => {
    // Create a map of drink quantities for this bill
    const drinkQuantities: Record<string, number> = {};

    // Aggregate quantities from bill items
    bill.items.forEach((item) => {
      if (drinkQuantities[item.drinkName]) {
        drinkQuantities[item.drinkName]! += item.amount;
      } else {
        drinkQuantities[item.drinkName] = item.amount;
      }
      // Update total quantities
      if (totalQuantities[item.drinkName] !== undefined) {
        totalQuantities[item.drinkName]! += item.amount;
      }
    });

    // Build the row data
    const row: string[] = [
      escapeCSVField(bill.userName, delimiter), // Name
    ];

    // Add drink columns (showing QUANTITIES, not prices)
    drinkColumns.forEach((drinkName) => {
      const quantity = drinkQuantities[drinkName] || 0;
      row.push(escapeCSVField(quantity.toString(), delimiter));
    });

    // Calculate Mahnfaktor (late fee percentage)
    const mahnfaktor =
      bill.drinksTotal > 0 ? (bill.fees / bill.drinksTotal) * 100 : 0;

    // Add billing summary columns
    row.push(escapeCSVField(formatCurrency(bill.drinksTotal), delimiter)); // Rechnungsbetrag (total cost)
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

  // Add empty row
  const emptyRow = new Array(headers.length).fill("");
  rows.push(emptyRow);

  // Add price per unit row
  const priceRow = createPriceRow(drinkColumns, drinkPrices, delimiter);
  rows.push(priceRow);

  // Add total quantities row
  const totalRow = createTotalRow(
    bills,
    drinkColumns,
    totalQuantities,
    delimiter
  );
  rows.push(totalRow);

  // Convert to CSV format
  const csvContent = [
    escapedHeaders.join(delimiter),
    ...rows.map((row) => row.join(delimiter)),
  ].join("\n");

  return csvContent;
}

/**
 * Creates the price per unit row
 */
function createPriceRow(
  drinkColumns: string[],
  drinkPrices: Record<string, number>,
  delimiter: string
): string[] {
  const priceRow: string[] = [escapeCSVField("Preis/Einheit", delimiter)];

  // Add price for each drink column
  drinkColumns.forEach((drinkName) => {
    const price = drinkPrices[drinkName] || 0;
    priceRow.push(escapeCSVField(formatCurrency(price), delimiter));
  });

  // Fill remaining columns with empty values
  priceRow.push(escapeCSVField("", delimiter)); // Rechnungsbetrag
  priceRow.push(escapeCSVField("", delimiter)); // Alte Rechnung
  priceRow.push(escapeCSVField("", delimiter)); // Mahnung
  priceRow.push(escapeCSVField("", delimiter)); // Zu zahlender Betrag
  priceRow.push(escapeCSVField("", delimiter)); // nix
  priceRow.push(escapeCSVField("", delimiter)); // Mahnfaktor
  priceRow.push(escapeCSVField("", delimiter)); // PayPal Link
  priceRow.push(escapeCSVField("", delimiter)); // Bezahlt status

  return priceRow;
}

/**
 * Creates the total quantities row
 */
function createTotalRow(
  bills: BillWithItems[],
  drinkColumns: string[],
  totalQuantities: Record<string, number>,
  delimiter: string
): string[] {
  const totalRow: string[] = [escapeCSVField("GESAMT", delimiter)];

  // Add total quantities for each drink column
  drinkColumns.forEach((drinkName) => {
    const totalQuantity = totalQuantities[drinkName] || 0;
    totalRow.push(escapeCSVField(totalQuantity.toString(), delimiter));
  });

  // Add summary totals for financial columns
  const totalDrinks = bills.reduce((sum, bill) => sum + bill.drinksTotal, 0);
  const totalOldBilling = bills.reduce(
    (sum, bill) => sum + bill.oldBillingAmount,
    0
  );
  const totalFees = bills.reduce((sum, bill) => sum + bill.fees, 0);
  const grandTotal = bills.reduce((sum, bill) => sum + bill.total, 0);

  totalRow.push(escapeCSVField(formatCurrency(totalDrinks), delimiter));
  totalRow.push(escapeCSVField(formatCurrency(totalOldBilling), delimiter));
  totalRow.push(escapeCSVField(formatCurrency(totalFees), delimiter));
  totalRow.push(escapeCSVField(formatCurrency(grandTotal), delimiter));
  totalRow.push(escapeCSVField("", delimiter));
  totalRow.push(escapeCSVField("", delimiter));
  totalRow.push(escapeCSVField("", delimiter));
  totalRow.push(escapeCSVField("", delimiter));

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
