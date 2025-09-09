// createUserPDF.ts
"use server";

import { eq } from "drizzle-orm";
import { jsPDF } from "jspdf";
import { db } from "~/server/db/index";
import { billItems, billPeriods, bills } from "~/server/db/schema";

interface UserBillData {
  bill: {
    id: string;
    userId: string;
    userName: string;
    status: string;
    oldBillingAmount: number;
    fees: number;
    drinksTotal: number;
    total: number;
    paidAt: Date | null;
  };
  billPeriod: {
    billNumber: string;
    createdAt: Date;
  };
  items: Array<{
    drinkName: string;
    amount: number;
    pricePerDrink: number;
    totalPricePerDrink: number;
  }>;
  umlage: number; // This would need to be calculated based on your business logic
}

interface PDFGenerationResult {
  success: boolean;
  pdfContent?: Buffer;
  fileName?: string;
  error?: string;
}

/**
 * Generates a PDF invoice for a specific bill
 * @param billId - The ID of the bill
 */
export async function generateUserBillPDF(
  billId: string
): Promise<PDFGenerationResult> {
  try {
    // 1. Get the bill
    const [userBill] = await db
      .select()
      .from(bills)
      .where(eq(bills.id, billId))
      .limit(1);

    if (!userBill) {
      return {
        success: false,
        error: `Bill with ID ${billId} not found`,
      };
    }

    // 2. Get the bill period information
    const [billPeriod] = await db
      .select()
      .from(billPeriods)
      .where(eq(billPeriods.id, userBill.billPeriodId))
      .limit(1);

    if (!billPeriod) {
      return {
        success: false,
        error: `Bill period ${userBill.billPeriodId} not found`,
      };
    }

    // 3. Get all items for this bill
    const billItemsData = await db
      .select()
      .from(billItems)
      .where(eq(billItems.billId, billId))
      .orderBy(billItems.drinkName);

    // 4. Calculate umlage (you'll need to implement this based on your business logic)
    const umlage = 0; // Placeholder - implement your calculation

    // 5. Prepare data for PDF
    const billData: UserBillData = {
      bill: userBill,
      billPeriod: {
        billNumber: billPeriod.billNumber,
        createdAt: billPeriod.createdAt,
      },
      items: billItemsData,
      umlage,
    };

    // 6. Generate PDF content
    const pdfBuffer = await generatePDFContent(billData);

    // 7. Create filename
    const fileName = `Rechnung_${
      billPeriod.billNumber
    }_${userBill.userName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;

    return {
      success: true,
      pdfContent: pdfBuffer,
      fileName,
    };
  } catch (error) {
    console.error("Error generating PDF:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown error generating PDF",
    };
  }
}

/**
 * Generates the actual PDF content
 */
async function generatePDFContent(data: UserBillData): Promise<Buffer> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  // Set font
  doc.setFont("helvetica");

  // Company/Header Information
  doc.setFontSize(20);
  doc.text("RECHNUNG", 20, 30);

  doc.setFontSize(12);
  doc.text(`Rechnungsnummer: ${data.billPeriod.billNumber}`, 20, 40);
  doc.text(`Datum: ${formatDate(data.billPeriod.createdAt)}`, 20, 47);

  // User Information
  doc.setFontSize(14);
  doc.text(`Rechnungsempfänger: ${data.bill.userName}`, 20, 65);

  // Add a line
  doc.line(20, 75, 190, 75);

  // Items Table Header
  let yPosition = 85;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Getränk", 20, yPosition);
  doc.text("Menge", 80, yPosition);
  doc.text("Preis/Stück", 110, yPosition);
  doc.text("Gesamt", 160, yPosition);

  // Items Table Content
  doc.setFont("helvetica", "normal");
  yPosition += 7;

  data.items.forEach((item) => {
    doc.text(item.drinkName, 20, yPosition);
    doc.text(item.amount.toString(), 80, yPosition);
    doc.text(formatCurrency(item.pricePerDrink), 110, yPosition);
    doc.text(formatCurrency(item.totalPricePerDrink), 160, yPosition);
    yPosition += 7;

    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 30;
    }
  });

  // Add separator line
  yPosition += 5;
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;

  // Summary Section
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Zusammenfassung:", 20, yPosition);

  doc.setFont("helvetica", "normal");
  yPosition += 10;

  // Summary items
  const summaryItems = [
    { label: "Rechnungsbetrag:", value: formatCurrency(data.bill.drinksTotal) },
    {
      label: "Alte Rechnung:",
      value: formatCurrency(data.bill.oldBillingAmount),
    },
    { label: "Mahnung:", value: formatCurrency(data.bill.fees) },
    { label: "Umlage:", value: formatCurrency(data.umlage) },
  ];

  summaryItems.forEach((item) => {
    doc.text(item.label, 20, yPosition);
    doc.text(item.value, 160, yPosition, { align: "right" });
    yPosition += 7;
  });

  // Total line
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Gesamtbetrag:", 20, yPosition);
  doc.text(formatCurrency(data.bill.total), 160, yPosition, { align: "right" });

  // Payment status
  yPosition += 15;
  doc.setFontSize(12);
  if (data.bill.status === "Bezahlt") {
    doc.setTextColor(0, 128, 0); // Green
    doc.text("BEZAHLT", 20, yPosition);
    if (data.bill.paidAt) {
      doc.text(`am ${formatDate(data.bill.paidAt)}`, 50, yPosition);
    }
  } else if (data.bill.status === "Gestundet") {
    doc.setTextColor(255, 165, 0); // Orange
    doc.text("GESTUNDET", 20, yPosition);
  } else {
    doc.setTextColor(255, 0, 0); // Red
    doc.text("UNBEZAHLT", 20, yPosition);
  }

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Footer
  doc.setFontSize(10);
  doc.text("Vielen Dank für Ihre Zahlung!", 105, 280, { align: "center" });

  // Convert to buffer
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  return pdfBuffer;
}

/**
 * Helper function to format currency for German locale
 */
function formatCurrency(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + " €";
}

/**
 * Helper function to format date for German locale
 */
function formatDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}
