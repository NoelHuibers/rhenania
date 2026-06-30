"use server";

import { eq } from "drizzle-orm";
import { jsPDF } from "jspdf";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	fuchsenBillItems,
	fuchsenBillPeriods,
	fuchsenBills,
} from "~/server/db/schema";
import { hasRole } from "../admin/userRoles";
import { getFuchsenBillingConfig } from "./billingConfig";

function eur(amount: number): string {
	return `${amount.toFixed(2).replace(".", ",")}€`;
}

function payPalAmount(amount: number): string {
	const [whole, cents] = amount.toFixed(2).replace(".", ",").split(",");
	return `${(whole ?? "0").padStart(3, "0")},${cents}`;
}

function formatDate(date: Date): string {
	const d = new Date(date);
	const day = d.getDate().toString().padStart(2, "0");
	const month = (d.getMonth() + 1).toString().padStart(2, "0");
	return `${day}.${month}.${d.getFullYear().toString().slice(-2)}`;
}

/**
 * Generate a PDF invoice for a fuchsen bill. The current user may download
 * their own bill; Fuchsenwart/Admin may download any. Returns the PDF as a
 * base64 string so the client can trigger a download without blob storage.
 */
export async function generateFuchsenBillPDF(billId: string): Promise<{
	success: boolean;
	base64?: string;
	fileName?: string;
	error?: string;
}> {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Authentifizierung erforderlich" };
	}

	try {
		const [bill] = await db
			.select()
			.from(fuchsenBills)
			.where(eq(fuchsenBills.id, billId))
			.limit(1);
		if (!bill) return { success: false, error: "Rechnung nicht gefunden" };

		if (bill.userId !== session.user.id) {
			const [isFuchs, isAdmin] = await Promise.all([
				hasRole(session.user.id, "Fuchs"),
				hasRole(session.user.id, "Admin"),
			]);
			if (!isFuchs && !isAdmin) {
				return { success: false, error: "Keine Berechtigung" };
			}
		}

		const [period] = await db
			.select()
			.from(fuchsenBillPeriods)
			.where(eq(fuchsenBillPeriods.id, bill.billPeriodId))
			.limit(1);
		const items = await db
			.select()
			.from(fuchsenBillItems)
			.where(eq(fuchsenBillItems.billId, billId))
			.orderBy(fuchsenBillItems.itemName);
		const config = await getFuchsenBillingConfig();

		const doc = new jsPDF({
			orientation: "portrait",
			unit: "mm",
			format: "a4",
		});
		const billNumber = period?.billNumber ?? "—";
		const createdAt = period?.createdAt ?? bill.createdAt;
		const paypalLink = config.paypalBaseUrl
			? `${config.paypalBaseUrl}${payPalAmount(bill.total)}`
			: "";

		// ---- Page 1: cover letter ----
		doc.setFont("helvetica");
		doc.setFontSize(12);
		if (config.senderName) doc.text(config.senderName, 20, 20);
		if (config.senderStreet) doc.text(config.senderStreet, 20, 27);
		if (config.senderCity) doc.text(config.senderCity, 20, 34);

		const dateLine = config.location
			? `${config.location}, den ${formatDate(createdAt)}`
			: formatDate(createdAt);
		doc.text(dateLine, 20, 50);

		doc.text(`Lieber ${bill.userName},`, 20, 70);
		let y = 85;
		for (const line of [
			"auf der nächsten Seite findest du deine Fuchsenladen-Rechnung aufgeschlüsselt,",
			`in Höhe von: ${eur(bill.total)}`,
		]) {
			doc.text(line, 20, y);
			y += 7;
		}
		y += 5;
		const payInfo = paypalLink
			? `Bitte zahle den Betrag per PayPal-Link oder auf das genannte Konto innerhalb von ${config.paymentDueDays} Tagen.`
			: `Bitte zahle den Betrag auf das genannte Konto innerhalb von ${config.paymentDueDays} Tagen.`;
		for (const line of doc.splitTextToSize(payInfo, 170) as string[]) {
			doc.text(line, 20, y);
			y += 7;
		}
		y += 10;
		doc.text("Mit freundlichen Grüßen,", 20, y);
		if (config.accountHolder) doc.text(config.accountHolder, 20, y + 10);

		y = 250;
		doc.setFontSize(11);
		if (paypalLink) {
			doc.text(paypalLink, 20, y);
			y += 7;
		}
		if (config.iban) {
			doc.text(`IBAN: ${config.iban}`, 20, y);
			y += 7;
		}
		if (config.accountHolder) doc.text(config.accountHolder, 20, y);

		// ---- Page 2: invoice details ----
		doc.addPage();
		let yp = 30;
		doc.setFontSize(12);
		doc.setFont("helvetica", "bold");
		doc.text("Artikel", 20, yp);
		doc.text("Menge", 90, yp);
		doc.text("Preis/Stück", 120, yp);
		doc.text("Gesamt", 165, yp);
		yp += 3;
		doc.line(20, yp, 190, yp);
		yp += 7;

		doc.setFont("helvetica", "normal");
		for (const item of items) {
			doc.text(item.itemName, 20, yp);
			doc.text(String(item.amount), 90, yp);
			doc.text(eur(item.pricePerItem), 120, yp);
			doc.text(eur(item.totalPrice), 165, yp);
			yp += 7;
			if (yp > 250) {
				doc.addPage();
				yp = 30;
			}
		}

		yp += 8;
		doc.line(20, yp, 190, yp);
		yp += 8;
		doc.text("Rechnungsbetrag:", 20, yp);
		doc.text(eur(bill.itemsTotal), 190, yp, { align: "right" });
		yp += 7;
		if (bill.oldBillingAmount > 0) {
			doc.text("Alter Saldo:", 20, yp);
			doc.text(eur(bill.oldBillingAmount), 190, yp, { align: "right" });
			yp += 7;
		}
		doc.line(20, yp, 190, yp);
		yp += 8;
		doc.setFont("helvetica", "bold");
		doc.setFontSize(14);
		doc.text("Gesamtbetrag:", 20, yp);
		doc.text(eur(bill.total), 190, yp, { align: "right" });

		yp += 15;
		doc.setFontSize(12);
		if (bill.status === "Bezahlt") {
			doc.setTextColor(0, 128, 0);
			doc.text(
				bill.paidAt ? `BEZAHLT am ${formatDate(bill.paidAt)}` : "BEZAHLT",
				20,
				yp,
			);
			doc.setTextColor(0, 0, 0);
		} else if (bill.status === "Gestundet") {
			doc.setTextColor(255, 165, 0);
			doc.text("GESTUNDET", 20, yp);
			doc.setTextColor(0, 0, 0);
		}

		const base64 = doc.output("datauristring").split(",")[1] ?? "";
		const fileName = `Fuchsenrechnung_${billNumber}_${bill.userName.replace(
			/[^a-zA-Z0-9]/g,
			"_",
		)}.pdf`;
		return { success: true, base64, fileName };
	} catch (error) {
		console.error("Error generating fuchsen bill PDF:", error);
		return { success: false, error: "Fehler beim Erstellen der PDF" };
	}
}
