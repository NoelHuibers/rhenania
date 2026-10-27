// user-bill-pdf.ts — a member's Getränke bill as PDF.
//
// Pure: renders what the bill shows (`UserBillData`) with the tenant's sender
// and payment target, without touching the database. The billing run renders
// the bills it has just written from memory (#23); `generateUserBillPDF`
// renders a stored bill.

import { jsPDF } from "jspdf";
import { formatDateWith } from "~/lib/format";
import { lateFeeSentence } from "~/lib/late-fee";
import type { GetraenkeBillSender } from "~/server/lib/getraenkekasse-payment";
import type { UserBillData } from "~/server/lib/user-bill-data";

/** Attachment name, e.g. `Rechnung_KW-43-26_Max_M_ller.pdf`. */
export function userBillPdfFileName(billNumber: string, userName: string) {
	return `Rechnung_${billNumber}_${userName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
}

/** The cover letter and the itemised bill. */
export function renderUserBillPDF(
	data: UserBillData,
	senderInfo: GetraenkeBillSender,
): Buffer {
	const { payment } = senderInfo;
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
	doc.text(senderInfo.name, 20, 20);
	doc.text(senderInfo.street, 20, 27);
	doc.text(senderInfo.city, 20, 34);

	// Date and location (right aligned)
	const dateStr = `${senderInfo.location} den ${formatDate(
		data.billPeriod.createdAt,
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
	for (const line of letterText) {
		doc.text(line, 20, yPos);
		yPos += 7;
	}

	yPos += 5;

	// Payment instructions
	const paymentText = [
		payment.paypalBaseUrl
			? `Bitte überweise mir den Betrag mit dem Paypal-Link oder auf das genannte Konto innerhalb von ${senderInfo.paymentDueDays}`
			: `Bitte überweise mir den Betrag auf das genannte Konto innerhalb von ${senderInfo.paymentDueDays}`,
		`Tagen. ${lateFeeSentence()}`,
		"Rechnung.",
	];

	for (const line of paymentText) {
		doc.text(line, 20, yPos);
		yPos += 7;
	}

	// Closing
	yPos += 10;
	doc.text("Mit freundlichen Grüßen,", 20, yPos);
	yPos += 10;
	doc.text(senderInfo.name, 20, yPos);

	// Payment details at bottom of first page
	const paypalLink = payment.paypalBaseUrl
		? `${payment.paypalBaseUrl}/${formatPayPalAmount(data.bill.total)}`
		: null;
	yPos = paypalLink ? 250 : 257;
	doc.setFontSize(11);
	if (paypalLink) {
		doc.text(paypalLink, 20, yPos);
		yPos += 7;
	}
	doc.text(payment.iban, 20, yPos);
	yPos += 7;
	doc.text(payment.accountHolder, 20, yPos);

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
	for (const item of data.items) {
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
	}

	// Add separator line
	yPosition += 10;
	doc.line(20, yPosition, 190, yPosition);
	yPosition += 10;

	// Summary Section: the stored parts of the bill (they add up to the total)
	for (const [i, line] of data.summary.entries()) {
		doc.setFont("helvetica", i === 0 ? "bold" : "normal");
		doc.text(line.label, 20, yPosition);
		doc.text(formatCurrency(line.amount), 160, yPosition, { align: "right" });
		yPosition += 7;
	}

	// Total line
	doc.line(20, yPosition, 190, yPosition);
	yPosition += 7;

	doc.setFont("helvetica", "bold");
	doc.setFontSize(14);
	doc.text("Gesamtbetrag:", 20, yPosition);
	doc.text(formatCurrency(data.total), 160, yPosition, { align: "right" });

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

	const footerLines = [
		...(paypalLink ? [paypalLink] : []),
		payment.iban,
		payment.accountHolder,
	];
	const footerStart = footerY + (3 - footerLines.length) * 7;
	for (const [i, line] of footerLines.entries()) {
		doc.text(line, 105, footerStart + i * 7, { align: "center" });
	}

	// Convert to buffer
	const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
	return pdfBuffer;
}

/**
 * Helper function to format currency for German locale
 */
function formatCurrency(amount: number): string {
	return `${amount.toFixed(2).replace(".", ",")}€`;
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

/** The Berlin calendar day as `dd.mm.yy`, whatever the server's time zone. */
function formatDate(date: Date): string {
	return formatDateWith(date, {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
	});
}
