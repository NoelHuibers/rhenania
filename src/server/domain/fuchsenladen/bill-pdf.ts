// bill-pdf.ts — a Fuchsenladen bill as PDF.
//
// Pure: a cover letter with the amount and the payment details, then the
// items, the old balance and the status. The Fuchsenladen service reads the
// bill, its period, items and the payment details.

import { jsPDF } from "jspdf";
import { isCredit } from "~/lib/bill-payment";
import { formatDateWith } from "~/lib/format";

export type FuchsenBillPdfInput = {
	bill: {
		userName: string;
		total: number;
		itemsTotal: number;
		oldBillingAmount: number;
		status: "Bezahlt" | "Unbezahlt" | "Gestundet" | "Übertragen";
		paidAt: Date | null;
		createdAt: Date;
	};
	/** Null for a bill whose period is gone. */
	period: { billNumber: string; createdAt: Date } | null;
	items: {
		itemName: string;
		amount: number;
		pricePerItem: number;
		totalPrice: number;
	}[];
	config: {
		senderName: string | null;
		senderStreet: string | null;
		senderCity: string | null;
		location: string | null;
		iban: string | null;
		accountHolder: string | null;
		paypalBaseUrl: string | null;
		paymentDueDays: number;
	};
};

function eur(amount: number): string {
	return `${amount.toFixed(2).replace(".", ",")}€`;
}

function payPalAmount(amount: number): string {
	const [whole, cents] = amount.toFixed(2).replace(".", ",").split(",");
	return `${(whole ?? "0").padStart(3, "0")},${cents}`;
}

/**
 * The bill's amount as the letter states it: a sum to pay, or a credit
 * (Guthaben) with nothing to pay and no PayPal link (#220).
 */
function amountWording(
	total: number,
	config: { paypalBaseUrl: string | null; paymentDueDays: number },
) {
	if (isCredit(total)) {
		return {
			letter: [
				"auf der nächsten Seite findest du deine Fuchsenladen-Rechnung aufgeschlüsselt.",
				`Du hast ein Guthaben von: ${eur(-total)}`,
			],
			payInfo:
				"Du musst nichts zahlen. Das Guthaben wird mit deiner nächsten Rechnung verrechnet.",
			paypalLink: "",
			totalLabel: "Guthaben:",
			totalAmount: eur(-total),
		};
	}
	const paypalLink = config.paypalBaseUrl
		? `${config.paypalBaseUrl}${payPalAmount(total)}`
		: "";
	return {
		letter: [
			"auf der nächsten Seite findest du deine Fuchsenladen-Rechnung aufgeschlüsselt,",
			`in Höhe von: ${eur(total)}`,
		],
		payInfo: paypalLink
			? `Bitte zahle den Betrag per PayPal-Link oder auf das genannte Konto innerhalb von ${config.paymentDueDays} Tagen.`
			: `Bitte zahle den Betrag auf das genannte Konto innerhalb von ${config.paymentDueDays} Tagen.`,
		paypalLink,
		totalLabel: "Gesamtbetrag:",
		totalAmount: eur(total),
	};
}

/** The Berlin calendar day as `dd.mm.yy`, whatever the server's time zone. */
function formatDate(date: Date): string {
	return formatDateWith(date, {
		day: "2-digit",
		month: "2-digit",
		year: "2-digit",
	});
}

/**
 * The bill as PDF (base64, so the client can download it without blob
 * storage) and its file name.
 */
export function renderFuchsenBillPdf({
	bill,
	period,
	items,
	config,
}: FuchsenBillPdfInput): { base64: string; fileName: string } {
	const doc = new jsPDF({
		orientation: "portrait",
		unit: "mm",
		format: "a4",
	});
	const billNumber = period?.billNumber ?? "—";
	const createdAt = period?.createdAt ?? bill.createdAt;
	const amount = amountWording(bill.total, config);
	const { paypalLink } = amount;

	// ---- Page 1: cover letter ----
	doc.setFont("helvetica");
	doc.setFontSize(12);
	if (config.senderName) {
		doc.text(config.senderName, 20, 20);
	}
	if (config.senderStreet) {
		doc.text(config.senderStreet, 20, 27);
	}
	if (config.senderCity) {
		doc.text(config.senderCity, 20, 34);
	}

	const dateLine = config.location
		? `${config.location}, den ${formatDate(createdAt)}`
		: formatDate(createdAt);
	doc.text(dateLine, 20, 50);

	doc.text(`Lieber ${bill.userName},`, 20, 70);
	let y = 85;
	for (const line of amount.letter) {
		doc.text(line, 20, y);
		y += 7;
	}
	y += 5;
	for (const line of doc.splitTextToSize(amount.payInfo, 170) as string[]) {
		doc.text(line, 20, y);
		y += 7;
	}
	y += 10;
	doc.text("Mit freundlichen Grüßen,", 20, y);
	if (config.accountHolder) {
		doc.text(config.accountHolder, 20, y + 10);
	}

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
	if (config.accountHolder) {
		doc.text(config.accountHolder, 20, y);
	}

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
	// A carried credit is negative and printed too, so the lines add up.
	if (bill.oldBillingAmount !== 0) {
		doc.text("Alter Saldo:", 20, yp);
		doc.text(eur(bill.oldBillingAmount), 190, yp, { align: "right" });
		yp += 7;
	}
	doc.line(20, yp, 190, yp);
	yp += 8;
	doc.setFont("helvetica", "bold");
	doc.setFontSize(14);
	doc.text(amount.totalLabel, 20, yp);
	doc.text(amount.totalAmount, 190, yp, { align: "right" });

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
	} else if (bill.status === "Übertragen") {
		doc.setTextColor(128, 128, 128);
		doc.text("IN EINE SPÄTERE RECHNUNG ÜBERTRAGEN", 20, yp);
		doc.setTextColor(0, 0, 0);
	}

	const base64 = doc.output("datauristring").split(",")[1] ?? "";
	const fileName = `Fuchsenrechnung_${billNumber}_${bill.userName.replace(
		/[^a-zA-Z0-9]/g,
		"_",
	)}.pdf`;
	return { base64, fileName };
}
