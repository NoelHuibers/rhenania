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
  umlage: number;
}

interface PDFGenerationResult {
  success: boolean;
  pdfContent?: Buffer;
  fileName?: string;
  error?: string;
}

// Configuration constants
const SENDER_INFO = {
  name: "Manuel Amadeus Riek",
  street: "Viehmarktstraße 28",
  city: "88400 Biberach",
  location: "Stuttgart",
  iban: "DE87 1001 1001 2107 9193 13",
  accountHolder: "Manuel Riek",
  paypalBaseUrl: "https://paypal.me/CorpsRhenaniaBier/",
  website: "www.rhenania-stuttgart.de/trinken",
  paymentDueDays: 14,
  lateFeePercent: 20,
  lateFeeMinAmount: 5,
};

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

  // ========== PAGE 1: Cover Letter ==========

  // Set font
  doc.setFont("helvetica");
  doc.setFontSize(12);

  // Sender address (top left)
  doc.text(SENDER_INFO.name, 20, 20);
  doc.text(SENDER_INFO.street, 20, 27);
  doc.text(SENDER_INFO.city, 20, 34);

  // Date and location (right aligned)
  const dateStr = `${SENDER_INFO.location} den ${formatDate(
    data.billPeriod.createdAt
  )}`;
  doc.text(dateStr, 20, 50);

  // Salutation
  doc.text(`Lieber ${data.bill.userName},`, 20, 70);

  // Main letter text
  const letterText = [
    "Auf der nächsten Seite findest du deine Getränkerechnung aufgeschlüsselt,",
    `in Höhe von: ${formatCurrency(data.bill.total)}`,
  ];

  let yPos = 85;
  letterText.forEach((line) => {
    doc.text(line, 20, yPos);
    yPos += 7;
  });

  yPos += 5;

  // Payment instructions
  const paymentText = [
    `Bitte überweise mir den Betrag mit dem Paypal-Link oder auf das genannte Konto innerhalb von ${SENDER_INFO.paymentDueDays}`,
    `Tagen. Ansonsten gibt es, ab ${SENDER_INFO.lateFeeMinAmount}€ Rechnungsbetrag, eine Mahnung in Höhe von ${SENDER_INFO.lateFeePercent}% auf die nächste`,
    "Rechnung.",
  ];

  paymentText.forEach((line) => {
    doc.text(line, 20, yPos);
    yPos += 7;
  });

  // Closing
  yPos += 10;
  doc.text("Mit freundlichen Grüßen,", 20, yPos);
  yPos += 10;
  doc.text(SENDER_INFO.accountHolder, 20, yPos);

  // Payment details at bottom of first page
  yPos = 250;
  const paypalLink = `${SENDER_INFO.paypalBaseUrl}${formatPayPalAmount(
    data.bill.total
  )}`;
  doc.setFontSize(11);
  doc.text(paypalLink, 20, yPos);
  yPos += 7;
  doc.text(SENDER_INFO.iban, 20, yPos);
  yPos += 7;
  doc.text(SENDER_INFO.accountHolder, 20, yPos);

  // ========== PAGE 2: Invoice Details ==========
  doc.addPage();

  // Items Table Header
  let yPosition = 30;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Getränk", 20, yPosition);
  doc.text("Menge", 80, yPosition);
  doc.text("Preis/Stück", 110, yPosition);
  doc.text("Gesamt", 160, yPosition);

  // Add line under header
  yPosition += 3;
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 7;

  // Items Table Content
  doc.setFont("helvetica", "normal");

  // List all items with their details
  data.items.forEach((item) => {
    doc.text(item.drinkName, 20, yPosition);
    doc.text(item.amount.toString(), 80, yPosition);
    doc.text(formatCurrency(item.pricePerDrink), 110, yPosition);
    doc.text(formatCurrency(item.totalPricePerDrink), 160, yPosition);
    yPosition += 7;

    // Check if we need a new page
    if (yPosition > 200) {
      doc.addPage();
      yPosition = 30;
    }
  });

  // Add separator line
  yPosition += 10;
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 10;

  // Summary Section
  doc.setFont("helvetica", "bold");
  doc.text("Rechnungsbetrag:", 20, yPosition);
  doc.text(formatCurrency(data.bill.drinksTotal), 160, yPosition, {
    align: "right",
  });
  yPosition += 7;

  doc.setFont("helvetica", "normal");
  doc.text("Alte Rechnung:", 20, yPosition);
  doc.text(formatCurrency(data.bill.oldBillingAmount), 160, yPosition, {
    align: "right",
  });
  yPosition += 7;

  doc.text("Mahnung:", 20, yPosition);
  doc.text(formatCurrency(data.bill.fees), 160, yPosition, { align: "right" });
  yPosition += 7;

  doc.text("Umlage:", 20, yPosition);
  doc.text(formatCurrency(data.umlage), 160, yPosition, { align: "right" });
  yPosition += 7;

  // Total line
  doc.line(20, yPosition, 190, yPosition);
  yPosition += 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Gesamtbetrag:", 20, yPosition);
  doc.text(formatCurrency(data.bill.total), 160, yPosition, { align: "right" });

  // Payment status (if applicable)
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
  }

  // Reset text color
  doc.setTextColor(0, 0, 0);

  // Footer with payment details (bottom of page)
  const footerY = 270;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const paypalLinkFooter = `${SENDER_INFO.paypalBaseUrl}${formatPayPalAmount(
    data.bill.total
  )}`;
  doc.text(paypalLinkFooter, 105, footerY, { align: "center" });
  doc.text(SENDER_INFO.iban, 105, footerY + 7, { align: "center" });
  doc.text(SENDER_INFO.accountHolder, 105, footerY + 14, { align: "center" });

  // Convert to buffer
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  return pdfBuffer;
}

/**
 * Helper function to format currency for German locale
 */
function formatCurrency(amount: number): string {
  return amount.toFixed(2).replace(".", ",") + "€";
}

/**
 * Helper function to format amount for PayPal link
 */
function formatPayPalAmount(amount: number): string {
  // PayPal expects format like "081,28" for German locale
  const formatted = amount.toFixed(2).replace(".", ",");
  // Pad with leading zeros if needed (e.g., "081,28" instead of "81,28")
  const parts = formatted.split(",");
  if (parts[0]) {
    parts[0] = parts[0].padStart(3, "0");
  }
  return parts.join(",");
}

/**
 * Helper function to format date for German locale
 */
function formatDate(date: Date): string {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear().toString().slice(-2); // Last 2 digits of year
  return `${day}.${month}.${year}`;
}
