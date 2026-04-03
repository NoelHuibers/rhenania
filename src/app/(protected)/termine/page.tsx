import { CalendarDays, MapPin } from "lucide-react";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Card, CardContent } from "~/components/ui/card";
import { getUpcomingEvents } from "~/server/actions/events/events";

export const metadata = {
	title: "Termine - Rhenania",
};

const TYPE_COLORS: Record<string, string> = {
	Kneipe: "bg-amber-100 text-amber-800",
	Ausflug: "bg-green-100 text-green-800",
	Sport: "bg-blue-100 text-blue-800",
	Offiziell: "bg-purple-100 text-purple-800",
	Sonstige: "bg-gray-100 text-gray-800",
};

function formatDate(d: Date) {
	return d.toLocaleDateString("de-DE", {
		weekday: "long",
		day: "2-digit",
		month: "long",
		year: "numeric",
	});
}

function formatTime(d: Date) {
	const h = d.getHours();
	const m = d.getMinutes();
	if (h === 0 && m === 0) return null;
	return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default async function TerminePage() {
	const events = await getUpcomingEvents();

	return (
		<SidebarLayout>
			<SiteHeader title="Termine" />
			<div className="mx-auto max-w-3xl p-6 space-y-6">

				{events.length === 0 ? (
					<p className="py-16 text-center text-muted-foreground">
						Keine kommenden Termine geplant.
					</p>
				) : (
					<div className="space-y-3">
						{events.map((event) => {
							const time = formatTime(event.date);
							return (
								<Card key={event.id}>
									<CardContent className="p-5 space-y-2">
										<div className="flex flex-wrap items-start justify-between gap-2">
											<h2 className="font-semibold text-lg leading-tight">
												{event.title}
											</h2>
											<span
												className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[event.type] ?? TYPE_COLORS.Sonstige}`}
											>
												{event.type}
											</span>
										</div>
										<div className="flex flex-wrap gap-4 text-muted-foreground text-sm">
											<span className="flex items-center gap-1.5">
												<CalendarDays className="h-4 w-4" />
												{formatDate(event.date)}
												{time && <span>· {time} Uhr</span>}
											</span>
											{event.location && (
												<span className="flex items-center gap-1.5">
													<MapPin className="h-4 w-4" />
													{event.location}
												</span>
											)}
										</div>
										{event.description && (
											<p className="text-sm text-muted-foreground">
												{event.description}
											</p>
										)}
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}
			</div>
		</SidebarLayout>
	);
}
