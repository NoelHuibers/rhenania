import fs from "node:fs";
import path from "node:path";
import type { DocumentProps } from "@react-pdf/renderer";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { ReactElement } from "react";
import { createElement } from "react";
import { attachmentDisposition } from "~/lib/content-disposition";
import { auth } from "~/server/auth";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import { semproProfile } from "~/server/lib/tenant-profile";
import { getPDFData } from "~/server/sempro/getPDFData";
import { SemProPDFDocument } from "~/server/sempro/SemProPDF";

/** The tenant's coat of arms from `public/sempro/` as a data URL, or null. */
function readLogo(logoFile: string | null): string | null {
	if (!logoFile) {
		return null;
	}
	const file = path.join(process.cwd(), "public", "sempro", logoFile);
	try {
		return `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;
	} catch {
		console.error(`SemPro logo not found: public/sempro/${logoFile}`);
		return null;
	}
}

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

	// Letterhead, cover text and coat of arms are the tenant's own (#36).
	const sempro = semproProfile(await getCurrentTenant());
	const wappenPath = readLogo(sempro.logoFile);

	const buffer = await renderToBuffer(
		createElement(SemProPDFDocument, {
			data,
			wappenPath,
			qrDataUrl,
			sempro,
		}) as ReactElement<DocumentProps>,
	);

	const filename = `Semesterprogramm_${data.semesterName.replace(/\s+/g, "_")}.pdf`;

	return new Response(new Uint8Array(buffer), {
		headers: {
			"Content-Type": "application/pdf",
			"Content-Disposition": attachmentDisposition(filename),
		},
	});
}
