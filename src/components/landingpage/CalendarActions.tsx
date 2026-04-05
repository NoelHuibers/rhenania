"use client";

import { Calendar, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export function CalendarActions({ calendarUrl }: { calendarUrl: string }) {
	return (
		<div className="flex items-center gap-6 rounded-xl border bg-muted/40 p-5">
			<div className="shrink-0 rounded-lg border bg-white p-2 shadow-sm">
				<QRCodeSVG value={calendarUrl} size={80} />
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<Calendar className="h-4 w-4 text-muted-foreground" />
					<span className="font-medium text-sm">Kalender abonnieren</span>
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Füge das Semesterprogramm direkt zu deinem Kalender hinzu – QR-Code
					scannen oder Datei herunterladen.
				</p>
				<a
					href="/api/calendar"
					download="semesterprogramm.ics"
					className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
				>
					<Download className="h-3.5 w-3.5" />
					.ics herunterladen
				</a>
			</div>
		</div>
	);
}
