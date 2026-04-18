"use client";

import { Calendar, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "~/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";

export function CalendarSubscribeButton({
	calendarUrl,
}: {
	calendarUrl: string;
}) {
	const webcalUrl = calendarUrl.replace(/^https?/, "webcal");

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className="h-8 gap-1.5">
					<Calendar className="h-3.5 w-3.5" />
					Abonnieren
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-3">
				<div className="space-y-3">
					<div>
						<p className="font-medium text-sm">Kalender abonnieren</p>
						<p className="mt-0.5 text-muted-foreground text-xs leading-snug">
							Scannen oder abonnieren – Termine aktualisieren sich automatisch.
						</p>
					</div>
					<div className="flex justify-center rounded-md border bg-white p-2">
						<QRCodeSVG value={webcalUrl} size={120} />
					</div>
					<div className="flex items-center gap-2">
						<a
							href={webcalUrl}
							className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
						>
							<Calendar className="h-3.5 w-3.5" />
							Abonnieren
						</a>
						<a
							href={calendarUrl}
							download="semesterprogramm.ics"
							className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-muted-foreground text-xs hover:text-foreground"
						>
							<Download className="h-3 w-3" />
							.ics
						</a>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
