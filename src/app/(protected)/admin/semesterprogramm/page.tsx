import { headers } from "next/headers";
import { EventsManager } from "~/components/admin/semesterprogramm/EventsManager";
import { RecurringEventsManager } from "~/components/admin/semesterprogramm/RecurringEventsManager";
import { SemProGenerieren } from "~/components/admin/semesterprogramm/SemProGenerieren";
import { VenuesManager } from "~/components/admin/semesterprogramm/VenuesManager";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getAllEvents } from "~/server/actions/events/events";
import { getAllRecurringEvents } from "~/server/actions/events/recurring";
import { getSemesterConfig } from "~/server/actions/semesterprogramm/semesterConfig";
import { getVenues } from "~/server/actions/venues";

export const metadata = {
	title: "Veranstaltungen verwalten - Rhenania",
};

export default async function AdminSemesterprogrammPage() {
	const [events, recurringEvents, venues, semConfig] = await Promise.all([
		getAllEvents(),
		getAllRecurringEvents(),
		getVenues(),
		getSemesterConfig(),
	]);

	const host = (await headers()).get("host") ?? "localhost:3000";
	const protocol = host.startsWith("localhost") ? "http" : "https";
	const semproUrl = `${protocol}://${host}/api/calendar`;

	return (
		<SidebarLayout>
			<SiteHeader title="Veranstaltungen verwalten" />
			<div className="mx-auto max-w-4xl p-6">
				<Tabs defaultValue="events">
					<TabsList className="mb-6">
						<TabsTrigger value="events">Einzeltermine</TabsTrigger>
						<TabsTrigger value="recurring">Wiederkehrend</TabsTrigger>
						<TabsTrigger value="venues">Orte</TabsTrigger>
						<TabsTrigger value="generieren">Generieren</TabsTrigger>
					</TabsList>
					<TabsContent value="events">
						<EventsManager initialEvents={events} venues={venues} />
					</TabsContent>
					<TabsContent value="recurring">
						<RecurringEventsManager
							initialRecurringEvents={recurringEvents}
							venues={venues}
						/>
					</TabsContent>
					<TabsContent value="venues">
						<VenuesManager initialVenues={venues} />
					</TabsContent>
					<TabsContent value="generieren">
						<SemProGenerieren
							calendarUrl={semproUrl}
							initialConfig={semConfig}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</SidebarLayout>
	);
}
