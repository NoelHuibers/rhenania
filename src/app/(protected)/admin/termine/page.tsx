import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { EventsManager } from "~/components/admin/termine/EventsManager";
import { RecurringEventsManager } from "~/components/admin/termine/RecurringEventsManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getAllEvents } from "~/server/actions/events/events";
import { getAllRecurringEvents } from "~/server/actions/events/recurring";

export const metadata = {
	title: "Veranstaltungen verwalten - Rhenania",
};

export default async function AdminTerminePage() {
	const [events, recurringEvents] = await Promise.all([
		getAllEvents(),
		getAllRecurringEvents(),
	]);

	return (
		<SidebarLayout>
			<SiteHeader title="Veranstaltungen verwalten" />
			<div className="mx-auto max-w-4xl p-6">
				<Tabs defaultValue="events">
					<TabsList className="mb-6">
						<TabsTrigger value="events">Einzeltermine</TabsTrigger>
						<TabsTrigger value="recurring">Wiederkehrend</TabsTrigger>
					</TabsList>
					<TabsContent value="events">
						<EventsManager initialEvents={events} />
					</TabsContent>
					<TabsContent value="recurring">
						<RecurringEventsManager initialRecurringEvents={recurringEvents} />
					</TabsContent>
				</Tabs>
			</div>
		</SidebarLayout>
	);
}
