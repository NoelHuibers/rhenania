"use server";

import { and, eq } from "drizzle-orm";
import { jsPDF } from "jspdf";
import { formatEur } from "~/lib/cc-kasse-format";
import { normalizePaypalLink } from "~/lib/paypal";
import { db } from "~/server/db";
import { kontos } from "~/server/db/schema";
import { getCurrentTenant } from "~/server/lib/tenant-context";

type Result =
	| { success: true; pdfContent: Buffer; fileName: string }
	| { success: false; error: string };

function formatDate(d: Date | number): string {
	return new Date(d).toLocaleDateString("de-DE", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	});
}

export async function generateBeitragPDF(
	chargeId: string,
	opts?: { isMahnung?: boolean },
): Promise<Result> {
	try {
		const charge = await db.query.semesterbeitragCharges.findFirst({
			where: (t, { eq }) => eq(t.id, chargeId),
			with: { run: true, member: true },
		});
		if (!charge?.run) {
			return { success: false, error: "Beitrag nicht gefunden" };
		}
		const run = charge.run;
		const member = charge.member;

		const [konto] = await db
			.select()
			.from(kontos)
			.where(and(eq(kontos.kasseType, "CC-Kasse"), eq(kontos.isActive, true)))
			.limit(1);
		if (!konto) {
			return {
				success: false,
				error: "Kein aktives CC-Kasse-Konto hinterlegt.",
			};
		}

		const tenant = await getCurrentTenant();
		const tenantName = tenant?.displayName ?? "Corps";
		const isMahnung = opts?.isMahnung ?? false;
		const total = charge.baseAmount + charge.mahnungAmount;

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
		doc.text(`den ${formatDate(new Date())}`, 190, 20, { align: "right" });

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
					`unser Semesterbeitrag (${run.name}) in Höhe von ${formatEur(charge.baseAmount)}`,
					`ist trotz Fälligkeit am ${formatDate(run.dueDate)} noch offen.`,
					`Wir erlauben uns daher, eine Mahngebühr von ${formatEur(charge.mahnungAmount)} zu berechnen.`,
					`Offener Gesamtbetrag: ${formatEur(total)}.`,
					"Bitte überweise den Betrag zeitnah auf das unten genannte Konto.",
				]
			: [
					`für ${run.name} bitten wir um deinen Semesterbeitrag in Höhe von ${formatEur(total)}.`,
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
		return { success: true, pdfContent, fileName };
	} catch (error) {
		console.error("Error generating Beitrag PDF:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "PDF-Fehler",
		};
	}
}
