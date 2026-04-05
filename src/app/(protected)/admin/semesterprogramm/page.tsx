import { EventsManager } from "~/components/admin/semesterprogramm/EventsManager";
import { RecurringEventsManager } from "~/components/admin/semesterprogramm/RecurringEventsManager";
import { VenuesManager } from "~/components/admin/semesterprogramm/VenuesManager";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getAllEvents } from "~/server/actions/events/events";
import { getAllRecurringEvents } from "~/server/actions/events/recurring";
import { getVenues } from "~/server/actions/venues";

export const metadata = {
	title: "Veranstaltungen verwalten - Rhenania",
};

export default async function AdminSemesterprogrammPage() {
	const [events, recurringEvents, venues] = await Promise.all([
		getAllEvents(),
		getAllRecurringEvents(),
		getVenues(),
	]);

	return (
		<SidebarLayout>
			<SiteHeader title="Veranstaltungen verwalten" />
			<div className="mx-auto max-w-4xl p-6">
				<Tabs defaultValue="events">
					<TabsList className="mb-6">
						<TabsTrigger value="events">Einzeltermine</TabsTrigger>
						<TabsTrigger value="recurring">Wiederkehrend</TabsTrigger>
						<TabsTrigger value="venues">Orte</TabsTrigger>
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
				</Tabs>
			</div>
		</SidebarLayout>
	);
}
