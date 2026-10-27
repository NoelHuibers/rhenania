import {
	formatAcademicTime,
	formatEventFullDate,
	startOfDayInTZ,
} from "~/lib/time";
import {
	getActiveImageBySection,
	getAllActiveImagesBySection,
} from "~/server/actions/bilder/images";
import {
	getPublicPastEvents,
	getPublicUpcomingEvents,
} from "~/server/actions/events/events";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import { type LandingEvent, RhenaniaExperience } from "./experience";

function relativeLabel(d: Date): string | null {
	const diffDays = Math.round(
		(startOfDayInTZ(d).getTime() - startOfDayInTZ(new Date()).getTime()) /
			86_400_000,
	);
	if (diffDays === 0) {
		return "Heute";
	}
	if (diffDays < 0) {
		return null;
	}
	if (diffDays === 1) {
		return "Morgen";
	}
	if (diffDays <= 7) {
		return `In ${diffDays} Tagen`;
	}
	return null;
}

const AKTIVE_FALLBACK = ["/0.webp", "/1.webp", "/2.webp", "/3.webp"];
const HAUS_FALLBACK = [
	"/Haus0.webp",
	"/Haus1.webp",
	"/Haus2.webp",
	"/Haus3.webp",
	"/Haus4.webp",
];

export async function RhenaniaLandingPage() {
	const [
		tenant,
		headerImage,
		aktiveImages,
		hausImages,
		footerImage,
		rawEvents,
	] = await Promise.all([
		getCurrentTenant(),
		getActiveImageBySection("header"),
		getAllActiveImagesBySection("aktive"),
		getAllActiveImagesBySection("haus"),
		getActiveImageBySection("footer"),
		getPublicUpcomingEvents(6),
	]);

	const heroImageUrl = headerImage?.imageUrl || "/stifi.jpg";
	const ctaImageUrl = footerImage?.imageUrl || "/background.webp";

	const aktiveUrls =
		aktiveImages.length > 0
			? aktiveImages.map((i) => i.imageUrl)
			: AKTIVE_FALLBACK;
	const hausUrls =
		hausImages.length > 0 ? hausImages.map((i) => i.imageUrl) : HAUS_FALLBACK;

	// Prefer upcoming events; if there are none, fall back to the most recent
	// past ones so the section still has something to show.
	const upcoming = rawEvents;
	const eventsArePast = upcoming.length === 0;
	const sourceEvents = eventsArePast ? await getPublicPastEvents(3) : upcoming;

	// Pre-format events server-side so the client section needs no Date/TZ logic.
	const events: LandingEvent[] = sourceEvents.map((e) => ({
		id: e.id,
		title: e.title,
		type: e.type,
		description: e.description,
		location: e.location,
		fullDate: formatEventFullDate(e.date),
		time: formatAcademicTime(e.date),
		relativeLabel: eventsArePast ? null : relativeLabel(e.date),
	}));

	return (
		<RhenaniaExperience
			displayName={tenant?.displayName ?? "Corps Rhenania"}
			heroImageUrl={heroImageUrl}
			ctaImageUrl={ctaImageUrl}
			aktiveImages={aktiveUrls}
			hausImages={hausUrls}
			events={events}
			eventsArePast={eventsArePast}
		/>
	);
}
