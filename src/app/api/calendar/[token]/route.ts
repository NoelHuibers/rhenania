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
	const [rows, venueRows, allRsvpRows, hiddenTypes] = await Promise.all([
		db.select().from(events).orderBy(asc(events.date)),
		db.select().from(venues),
		db
			.select({
				eventId: eventRsvps.eventId,
				userId: eventRsvps.userId,
				status: eventRsvps.status,
				userName: users.name,
				userEmail: users.email,
				createdAt: eventRsvps.createdAt,
				updatedAt: eventRsvps.updatedAt,
			})
			.from(eventRsvps)
			.innerJoin(users, eq(eventRsvps.userId, users.id)),
		getHiddenEventTypesForUser(tokenRow.userId),
	]);

	const hiddenSet = new Set<string>(hiddenTypes);
	const visibleRows = rows.filter((e) => !hiddenSet.has(e.type));
	const venueMap = new Map(venueRows.map((v) => [v.shortName, v.fullAddress]));

	type Rsvp = (typeof allRsvpRows)[number];
	const rsvpsByEvent = new Map<string, Rsvp[]>();
	for (const r of allRsvpRows) {
		const list = rsvpsByEvent.get(r.eventId) ?? [];
		list.push(r);
		rsvpsByEvent.set(r.eventId, list);
	}

	const vevents = visibleRows
		.map((event) => {
			const dtstart = formatICalDate(event.date);
			const dtend = event.endDate
				? formatICalDate(event.endDate)
				: formatICalDate(new Date(event.date.getTime() + 2 * 60 * 60 * 1000));

			const eventRsvpList = rsvpsByEvent.get(event.id) ?? [];

			let latestMs = (
				event.updatedAt ??
				event.createdAt ??
				event.date
			).getTime();
			for (const r of eventRsvpList) {
				const rMs = (r.updatedAt ?? r.createdAt).getTime();
				if (rMs > latestMs) latestMs = rMs;
			}
			const sequence = Math.floor(latestMs / 1000);
			const lastModified = formatICalDate(new Date(latestMs));

			const lines = [
				"BEGIN:VEVENT",
				`UID:${event.id}@rhenania`,
				`DTSTAMP:${formatICalDate(now)}`,
				`DTSTART:${dtstart}`,
				`DTEND:${dtend}`,
				`SEQUENCE:${sequence}`,
				`LAST-MODIFIED:${lastModified}`,
				foldLine(`SUMMARY:${escapeICalText(event.title)}`),
				"ORGANIZER;CN=Rhenania:mailto:noreply@rhenania.invalid",
			];
			const currentUserRsvp = eventRsvpList.find(
				(r) => r.userId === tokenRow.userId,
			);
			const currentPartstat = currentUserRsvp
				? (STATUS_TO_PARTSTAT[currentUserRsvp.status] ?? "NEEDS-ACTION")
				: "NEEDS-ACTION";
			lines.push(
				foldLine(
					`ATTENDEE;CN=${escapeICalText(tokenRow.userName ?? tokenRow.userEmail)};PARTSTAT=${currentPartstat};RSVP=TRUE:mailto:${tokenRow.userEmail}`,
				),
			);

			for (const r of eventRsvpList) {
				if (r.userId === tokenRow.userId) continue;
				const partstat = STATUS_TO_PARTSTAT[r.status] ?? "NEEDS-ACTION";
				const cn = escapeICalText(r.userName ?? r.userEmail);
				lines.push(
					foldLine(
						`ATTENDEE;CN=${cn};PARTSTAT=${partstat};ROLE=OPT-PARTICIPANT:mailto:noreply+${r.userId}@rhenania.invalid`,
					),
				);
			}

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
