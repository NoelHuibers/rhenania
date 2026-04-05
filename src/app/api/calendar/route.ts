import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { events, venues } from "~/server/db/schema";

function formatICalDate(date: Date): string {
	return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function escapeICalText(str: string): string {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
	if (line.length <= 75) return line;
	const chunks: string[] = [];
	chunks.push(line.slice(0, 75));
	let i = 75;
	while (i < line.length) {
		chunks.push(` ${line.slice(i, i + 74)}`);
		i += 74;
	}
	return chunks.join("\r\n");
}

export async function GET() {
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
				`UID:${event.id}@rhenania`,
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
		"PRODID:-//Rhenania//Semesterprogramm//DE",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		foldLine("X-WR-CALNAME:Rhenania Semesterprogramm"),
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
