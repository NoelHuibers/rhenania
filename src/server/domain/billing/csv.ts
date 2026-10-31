// csv.ts — a bill period as the Kasse's CSV sheet.
//
// Pure: lays out the bills of one period (groups first, then members, by
// name) with a quantity column per drink, the money columns, the PayPal
// link and a price and a total row. The billing service reads the data.

import { csvCell } from "~/lib/csv";
import { sumMoney } from "~/lib/money";

/**
 * The period's sheet: a row per bill (groups first), a quantity column per
 * drink in `drinks` (by name), then the price and the total row.
 */
export function billPeriodCsv({
	bills,
	drinks,
	billNumber,
	paypalBaseUrl,
	delimiter,
}: {
	bills: BillWithItems[];
	drinks: { name: string; price: number }[];
	billNumber: string;
	paypalBaseUrl: string | null;
	delimiter: string;
}) {
	const drinkColumns = drinks.map((d) => d.name);
	const drinkPrices: Record<string, number> = {};
	for (const d of drinks) {
		drinkPrices[d.name] = d.price;
	}
	const sorted = sortBillsWithEventsFirst(bills);
	return {
		csvContent: generateCSVContent(
			sorted,
			drinkColumns,
			drinkPrices,
			billNumber,
			{
				paypalBaseUrl,
				delimiter,
			},
		),
		billCount: sorted.length,
		drinkColumns,
	};
}

export interface BillWithItems {
	id: string;
	userId: string;
	userName: string;
	status: string;
	oldBillingAmount: number;
	fees: number;
	umlage: number;
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

/**
 * Sorts bills to ensure event bills appear first
 * @param bills - Array of bills to sort
 * @returns Sorted array with events first, then regular users
 */
function sortBillsWithEventsFirst(bills: BillWithItems[]): BillWithItems[] {
	// Separate events and regular users
	const eventBills: BillWithItems[] = [];
	const regularBills: BillWithItems[] = [];

	for (const bill of bills) {
		if (bill.userId.startsWith("event-")) {
			eventBills.push(bill);
		} else {
			regularBills.push(bill);
		}
	}

	// Sort events by name (optional - you can customize this)
	eventBills.sort((a, b) => a.userName.localeCompare(b.userName));

	// Sort regular bills by name
	regularBills.sort((a, b) => a.userName.localeCompare(b.userName));

	// Combine with events first
	return [...eventBills, ...regularBills];
}

/**
 * One CSV field: quoted when needed and guarded against formula injection
 * (names come from members and would otherwise run in Excel).
 */
function escapeCSVField(value: string, delimiter: string): string {
	return csvCell(value, delimiter);
}

/** The CSV text of `bills`, in the order given. */
function generateCSVContent(
	bills: BillWithItems[],
	drinkColumns: string[],
	drinkPrices: Record<string, number>,
	_billNumber: string,
	options: {
		paypalBaseUrl: string | null;
		delimiter: string;
	},
): string {
	const { paypalBaseUrl, delimiter } = options;

	// Create header row with proper escaping
	const headers = [
		"Name",
		...drinkColumns,
		"Rechnungsbetrag",
		"Alte Rechnung",
		"Mahnung",
		"Umlage",
		"Zu zahlender Betrag",
		"nix",
		"Mahnfaktor",
		"PayPal Link",
		'Wenn Bezahlt "Bezahlt" eintragen',
	];

	// Escape header fields
	const escapedHeaders = headers.map((header) =>
		escapeCSVField(header, delimiter),
	);

	// Track total quantities for each drink
	const totalQuantities: Record<string, number> = {};
	for (const drink of drinkColumns) {
		totalQuantities[drink] = 0;
	}

	// Process each bill into a CSV row
	const rows: string[][] = bills.map((bill) => {
		// Create a map of drink quantities for this bill
		const drinkQuantities: Record<string, number> = {};

		// Aggregate quantities from bill items
		for (const item of bill.items) {
			if (drinkQuantities[item.drinkName]) {
				// biome-ignore lint/style/noNonNullAssertion: guarded by if-check above
				drinkQuantities[item.drinkName]! += item.amount;
			} else {
				drinkQuantities[item.drinkName] = item.amount;
			}
			// Update total quantities
			if (totalQuantities[item.drinkName] !== undefined) {
				// biome-ignore lint/style/noNonNullAssertion: guarded by !== undefined check above
				totalQuantities[item.drinkName]! += item.amount;
			}
		}

		// Build the row data
		const row: string[] = [
			escapeCSVField(bill.userName, delimiter), // Name
		];

		// Add drink columns (showing QUANTITIES, not prices)
		for (const drinkName of drinkColumns) {
			const quantity = drinkQuantities[drinkName] || 0;
			row.push(escapeCSVField(quantity.toString(), delimiter));
		}

		// Mahnfaktor: the late fee as a percentage of the carried-over amount
		// it was charged on (not of the new drinks).
		const mahnfaktor =
			bill.oldBillingAmount > 0 ? (bill.fees / bill.oldBillingAmount) * 100 : 0;

		// Add billing summary columns
		row.push(escapeCSVField(formatCurrency(bill.drinksTotal), delimiter)); // Rechnungsbetrag (total cost)
		row.push(escapeCSVField(formatCurrency(bill.oldBillingAmount), delimiter)); // Alte Rechnung
		row.push(escapeCSVField(formatCurrency(bill.fees), delimiter)); // Mahnung
		row.push(escapeCSVField(formatCurrency(bill.umlage), delimiter)); // Umlage
		row.push(escapeCSVField(formatCurrency(bill.total), delimiter)); // Zu zahlender Betrag
		row.push(escapeCSVField(bill.userName, delimiter)); // nix (using userName as identifier)
		row.push(escapeCSVField(formatPercentage(mahnfaktor), delimiter)); // Mahnfaktor

		// PayPal link if amount > 0 and not paid (empty without a PayPal)
		const due = bill.total > 0 && bill.status !== "Bezahlt";
		const paypalLink = !due
			? "#####"
			: paypalBaseUrl
				? `${paypalBaseUrl}/${bill.total.toFixed(2)}EUR`
				: "";
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
		delimiter,
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
	delimiter: string,
): string[] {
	const priceRow: string[] = [escapeCSVField("Preis/Einheit", delimiter)];

	// Add price for each drink column
	for (const drinkName of drinkColumns) {
		const price = drinkPrices[drinkName] || 0;
		priceRow.push(escapeCSVField(formatCurrency(price), delimiter));
	}

	// Fill remaining columns with empty values
	priceRow.push(escapeCSVField("", delimiter)); // Rechnungsbetrag
	priceRow.push(escapeCSVField("", delimiter)); // Alte Rechnung
	priceRow.push(escapeCSVField("", delimiter)); // Mahnung
	priceRow.push(escapeCSVField("", delimiter)); // Umlage
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
	delimiter: string,
): string[] {
	const totalRow: string[] = [escapeCSVField("GESAMT", delimiter)];

	// Add total quantities for each drink column
	for (const drinkName of drinkColumns) {
		const totalQuantity = totalQuantities[drinkName] || 0;
		totalRow.push(escapeCSVField(totalQuantity.toString(), delimiter));
	}

	// Add summary totals for financial columns, summed in whole cents.
	const columnTotal = (pick: (bill: BillWithItems) => number) =>
		sumMoney(bills.map(pick));

	for (const total of [
		columnTotal((b) => b.drinksTotal),
		columnTotal((b) => b.oldBillingAmount),
		columnTotal((b) => b.fees),
		columnTotal((b) => b.umlage),
		columnTotal((b) => b.total),
	]) {
		totalRow.push(escapeCSVField(formatCurrency(total), delimiter));
	}
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
	return `${amount.toFixed(2).replace(".", ",")} EUR`;
}

/**
 * Helper function to format percentage for German locale
 */
function formatPercentage(value: number): string {
	return `${value.toFixed(2).replace(".", ",")} %`;
}
