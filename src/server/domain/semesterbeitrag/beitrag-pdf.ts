// beitrag-pdf.ts — a Semesterbeitrag invoice or reminder as PDF.
//
// Pure: the letter to the member with the amount, the due date and the
// CC-Kasse's bank details. The Semesterbeitrag service reads the charge,
// its run and member and the active CC-Kasse account.

import { jsPDF } from "jspdf";
// formatDate prints the Berlin calendar day (`15.11.2026`), whatever the
// server's time zone.
import { formatDate, formatEUR } from "~/lib/format";
import { normalizePaypalLink } from "~/lib/paypal";

export type BeitragPdfInput = {
	charge: {
		memberName: string;
		baseAmount: number;
		mahnungAmount: number;
		mahnungSentAt: Date | null;
	};
	run: { name: string; dueDate: Date; mahnungFee: number };
	/** Null for a charge whose member is gone. */
	member: {
		street: string | null;
		houseNumber: string | null;
		addressLine2: string | null;
		postalCode: string | null;
		city: string | null;
	} | null;
	konto: {
		iban: string;
		bic: string;
		bankName: string;
		paypalLink: string | null;
	};
	/** The Corps' display name: sender, signature and account holder. */
	tenantName: string;
	/** The letter's date. */
	today: Date;
	isMahnung: boolean;
};

/** The Beitrag invoice (or reminder) of a charge as a PDF. */
export function renderBeitragPdf({
	charge,
	run,
	member,
	konto,
	tenantName,
	today,
	isMahnung,
}: BeitragPdfInput): { pdfContent: Buffer; fileName: string } {
	// A reminder that has not been sent yet is built *before* the charge is
	// switched to Gemahnt (so a failed send stays retryable), hence it shows
	// the run's fee rather than the still-unset stored one.
	const mahnungAmount =
		isMahnung && !charge.mahnungSentAt ? run.mahnungFee : charge.mahnungAmount;
	const total = charge.baseAmount + mahnungAmount;

	const doc = new jsPDF({
		orientation: "portrait",
		unit: "mm",
		format: "a4",
	});
	doc.setFont("helvetica");
	doc.setFontSize(12);

	// Sender / date
	doc.setFont("helvetica", "bold");
	doc.text(tenantName, 20, 20);
	doc.setFont("helvetica", "normal");
	doc.text(`den ${formatDate(today)}`, 190, 20, { align: "right" });

	// Recipient address block
	let y = 42;
	doc.text(charge.memberName, 20, y);
	y += 6;
	if (member?.street) {
		doc.text(
			`${member.street}${member.houseNumber ? ` ${member.houseNumber}` : ""}`,
			20,
			y,
		);
		y += 6;
	}
	if (member?.addressLine2) {
		doc.text(member.addressLine2, 20, y);
		y += 6;
	}
	if (member?.postalCode || member?.city) {
		doc.text(`${member.postalCode ?? ""} ${member.city ?? ""}`.trim(), 20, y);
		y += 6;
	}

	// Title + body
	y = 85;
	doc.setFont("helvetica", "bold");
	doc.setFontSize(14);
	doc.text(
		isMahnung ? "Zahlungserinnerung — Semesterbeitrag" : "Semesterbeitrag",
		20,
		y,
	);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(12);
	y += 12;
	doc.text(`Lieber ${charge.memberName},`, 20, y);
	y += 10;

	const lines = isMahnung
		? [
				`unser Semesterbeitrag (${run.name}) in Höhe von ${formatEUR(charge.baseAmount)}`,
				`ist trotz Fälligkeit am ${formatDate(run.dueDate)} noch offen.`,
				`Wir erlauben uns daher, eine Mahngebühr von ${formatEUR(mahnungAmount)} zu berechnen.`,
				`Offener Gesamtbetrag: ${formatEUR(total)}.`,
				"Bitte überweise den Betrag zeitnah auf das unten genannte Konto.",
			]
		: [
				`für ${run.name} bitten wir um deinen Semesterbeitrag in Höhe von ${formatEUR(total)}.`,
				`Bitte überweise den Betrag innerhalb von 2 Wochen (bis ${formatDate(run.dueDate)})`,
				"auf das unten genannte Konto.",
			];
	for (const l of lines) {
		doc.text(l, 20, y);
		y += 7;
	}

	y += 8;
	doc.text("Mit corpsbrüderlichen Grüßen", 20, y);
	y += 7;
	doc.text(tenantName, 20, y);

	// Bank details
	const clean = (s: string) => s.replace(/\s+/g, " ").trim();
	const paypalUrl = konto.paypalLink
		? normalizePaypalLink(konto.paypalLink)
		: null;
	let footerY = paypalUrl ? 243 : 250;
	doc.setFont("helvetica", "bold");
	doc.text("Bankverbindung", 20, footerY);
	doc.setFont("helvetica", "normal");
	footerY += 7;
	doc.text(`Kontoinhaber: ${clean(tenantName)}`, 20, footerY);
	footerY += 7;
	doc.text(`IBAN: ${clean(konto.iban)}`, 20, footerY);
	if (konto.bic) {
		footerY += 7;
		doc.text(`BIC: ${clean(konto.bic)}`, 20, footerY);
	}
	footerY += 7;
	doc.text(`Bank: ${clean(konto.bankName)}`, 20, footerY);
	footerY += 7;
	doc.text(`Verwendungszweck: ${run.name} ${charge.memberName}`, 20, footerY);
	if (paypalUrl) {
		footerY += 7;
		doc.text("Oder bequem per PayPal: ", 20, footerY);
		const labelWidth = doc.getTextWidth("Oder bequem per PayPal: ");
		doc.setTextColor(0, 0, 238);
		doc.textWithLink(paypalUrl, 20 + labelWidth, footerY, { url: paypalUrl });
		doc.setTextColor(0, 0, 0);
	}

	const pdfContent = Buffer.from(doc.output("arraybuffer"));
	const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");
	const fileName = `${isMahnung ? "Mahnung" : "Beitragsrechnung"}_${safe(run.name)}_${safe(charge.memberName)}.pdf`;
	return { pdfContent, fileName };
}
