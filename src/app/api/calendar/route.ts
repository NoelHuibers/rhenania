import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { events, venues } from "~/server/db/schema";
import { escapeICalText, foldLine, formatICalDate } from "~/server/lib/ical";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export async function GET() {
	const tenant = await getCurrentTenant();
	if (!tenant) {
		return new NextResponse("Not Found", { status: 404 });
	}

	const now = new Date();
	const [rows, venueRows] = await Promise.all([
		db.select().from(events).orderBy(asc(events.date)),
		db.select().from(venues),
	]);
	const venueMap = new Map(venueRows.map((v) => [v.shortName, v.fullAddress]));

	const vevents = rows
		.map((event) => {
			const dtstart = formatICalDate(event.date);
			const dtend = event.endDate
				? formatICalDate(event.endDate)
				: formatICalDate(new Date(event.date.getTime() + 2 * 60 * 60 * 1000));

			const lines = [
				"BEGIN:VEVENT",
				`UID:${event.id}@${tenant.slug}`,
				`DTSTAMP:${formatICalDate(now)}`,
				`DTSTART:${dtstart}`,
				`DTEND:${dtend}`,
				foldLine(`SUMMARY:${escapeICalText(event.title)}`),
			];

			if (event.location) {
				const resolved = venueMap.get(event.location) ?? event.location;
				lines.push(foldLine(`LOCATION:${escapeICalText(resolved)}`));
			}
			if (event.description) {
				lines.push(
					foldLine(`DESCRIPTION:${escapeICalText(event.description)}`),
				);
			}
			if (event.isCancelled) {
				lines.push("STATUS:CANCELLED");
			}

			lines.push("END:VEVENT");
			return lines.join("\r\n");
		})
		.join("\r\n");

	const ical = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		foldLine(`PRODID:-//${tenant.displayName}//Semesterprogramm//DE`),
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		foldLine(
			`X-WR-CALNAME:${escapeICalText(`${tenant.displayName} Semesterprogramm`)}`,
		),
		"X-WR-TIMEZONE:Europe/Berlin",
		vevents,
		"END:VCALENDAR",
	].join("\r\n");

	return new NextResponse(ical, {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Cache-Control": "no-cache",
		},
	});
}
