import { renderToBuffer } from "@react-pdf/renderer";
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import QRCode from "qrcode";
import { auth } from "~/server/auth";
import { getPDFData } from "~/server/sempro/getPDFData";
import { SemProPDFDocument } from "~/server/sempro/SemProPDF";

export async function GET(request: Request) {
	const session = await auth();
	if (!session?.user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const data = await getPDFData();
	if (!data) {
		return new Response(
			"Semesterkonfiguration unvollständig. Bitte Semester und Datum prüfen.",
			{ status: 400 },
		);
	}

	// Build calendar URL from request origin
	const { origin } = new URL(request.url);
	const calendarUrl = `${origin}/api/calendar`;

	// Generate QR code as base64 PNG data URL
	let qrDataUrl: string | null = null;
	try {
		qrDataUrl = await QRCode.toDataURL(calendarUrl, {
			width: 256,
			margin: 1,
			color: { dark: "#000000", light: "#ffffff" },
		});
	} catch {
		// proceed without QR code
	}

	const wappenFile = path.join(
		process.cwd(),
		"public",
		"sempro",
		"Wappen_Tranzparent.png",
	);
	const wappenPath = `data:image/png;base64,${fs.readFileSync(wappenFile).toString("base64")}`;

	const buffer = await renderToBuffer(
		createElement(SemProPDFDocument, { data, wappenPath, qrDataUrl }) as ReactElement<DocumentProps>,
	);

	const filename = `Semesterprogramm_${data.semesterName.replace(/\s+/g, "_")}.pdf`;

	return new Response(new Uint8Array(buffer), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="${filename}"`,
		},
	});
}
