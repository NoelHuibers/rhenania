import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getHiddenEventTypesForUser } from "~/server/actions/profile/preferences";
import { db } from "~/server/db";
import {
	calendarTokens,
	eventRsvps,
	events,
	users,
	venues,
} from "~/server/db/schema";

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

const STATUS_TO_PARTSTAT: Record<string, string> = {
	yes: "ACCEPTED",
	no: "DECLINED",
	maybe: "TENTATIVE",
};

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;

	const [tokenRow] = await db
		.select({
			userId: calendarTokens.userId,
			userName: users.name,
			userEmail: users.email,
		})
		.from(calendarTokens)
		.innerJoin(users, eq(calendarTokens.userId, users.id))
		.where(eq(calendarTokens.token, token))
		.limit(1);

	if (!tokenRow) {
		return new NextResponse("Not Found", { status: 404 });
	}

	await db
		.update(calendarTokens)
		.set({ lastUsedAt: new Date() })
		.where(eq(calendarTokens.token, token));

	const now = new Date();
	const [rows, venueRows, rsvpRows, hiddenTypes] = await Promise.all([
		db.select().from(events).orderBy(asc(events.date)),
		db.select().from(venues),
		db
			.select({
				eventId: eventRsvps.eventId,
				status: eventRsvps.status,
			})
			.from(eventRsvps)
			.where(eq(eventRsvps.userId, tokenRow.userId)),
		getHiddenEventTypesForUser(tokenRow.userId),
	]);

	const hiddenSet = new Set<string>(hiddenTypes);
	const visibleRows = rows.filter((e) => !hiddenSet.has(e.type));
	const venueMap = new Map(venueRows.map((v) => [v.shortName, v.fullAddress]));
	const rsvpMap = new Map(rsvpRows.map((r) => [r.eventId, r.status]));
	const attendeeCn = escapeICalText(tokenRow.userName ?? tokenRow.userEmail);
	const attendeeMailto = `mailto:${tokenRow.userEmail}`;

	const vevents = visibleRows
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
				"ORGANIZER;CN=Rhenania:mailto:noreply@rhenania.invalid",
			];

			const userStatus = rsvpMap.get(event.id);
			const partstat = userStatus
				? STATUS_TO_PARTSTAT[userStatus]
				: "NEEDS-ACTION";
			lines.push(
				foldLine(
					`ATTENDEE;CN=${attendeeCn};PARTSTAT=${partstat};RSVP=TRUE:${attendeeMailto}`,
				),
			);

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
