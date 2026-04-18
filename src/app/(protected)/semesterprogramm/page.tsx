import { CalendarDays, MapPin } from "lucide-react";
import { headers } from "next/headers";
import { CalendarSubscribeButton } from "~/components/semesterprogramm/CalendarSubscribeButton";
import { EventTypeFilter } from "~/components/semesterprogramm/EventTypeFilter";
import { RsvpAttendees } from "~/components/semesterprogramm/RsvpAttendees";
import { RsvpControls } from "~/components/semesterprogramm/RsvpControls";
import { WeekPreview } from "~/components/semesterprogramm/WeekPreview";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { academicTimeLabel } from "~/lib/academic-time";
import { getOrCreateCalendarToken } from "~/server/actions/events/calendarToken";
import { getUpcomingEvents } from "~/server/actions/events/events";
import {
	getRsvpCountsForEvents,
	getUserRsvpsForEvents,
	getYesAttendeePreviewForEvents,
} from "~/server/actions/events/rsvp";
import { getHiddenEventTypes } from "~/server/actions/profile/preferences";

export const metadata = {
	title: "Semesterprogramm - Rhenania",
};

const TYPE_COLORS: Record<string, string> = {
	Intern: "bg-blue-100 text-blue-700",
	AHV: "bg-amber-100 text-amber-700",
	oCC: "bg-green-100 text-green-700",
	SC: "bg-purple-100 text-purple-700",
	"Jour Fix": "bg-cyan-100 text-cyan-700",
	Stammtisch: "bg-orange-100 text-orange-700",
	Sonstige: "bg-gray-100 text-gray-600",
};

function formatTime(d: Date) {
	const h = d.getHours();
	const m = d.getMinutes();
	if (h === 0 && m === 0) return null;
	return academicTimeLabel(h, m);
}

function monthLabel(d: Date) {
	return d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
}

export default async function SemesterprogrammPage() {
	const [allEvents, hiddenTypes] = await Promise.all([
		getUpcomingEvents(),
		getHiddenEventTypes(),
	]);
	const hiddenSet = new Set<string>(hiddenTypes);
	const events = allEvents.filter((e) => !hiddenSet.has(e.type));
	const eventIds = events.map((e) => e.id);
	const [countsMap, userRsvpMap, previewMap] = await Promise.all([
		getRsvpCountsForEvents(eventIds),
		getUserRsvpsForEvents(eventIds),
		getYesAttendeePreviewForEvents(eventIds),
	]);
	const host = (await headers()).get("host") ?? "localhost:3000";
	const protocol = host.startsWith("localhost") ? "http" : "https";
	const calendarToken = await getOrCreateCalendarToken();
	const calendarUrl = calendarToken
		? `${protocol}://${host}/api/calendar/${calendarToken}`
		: `${protocol}://${host}/api/calendar`;

	// Group events by month
	const grouped = events.reduce<{ label: string; items: typeof events }[]>(
		(acc, event) => {
			const label = monthLabel(event.date);
			const last = acc[acc.length - 1];
			if (last?.label === label) {
				last.items.push(event);
			} else {
				acc.push({ label, items: [event] });
			}
			return acc;
		},
		[],
	);

	return (
		<SidebarLayout>
			<SiteHeader title="Semesterprogramm" />
			<div className="mx-auto max-w-2xl p-6 lg:grid lg:max-w-7xl lg:grid-cols-[320px_1fr] lg:gap-10 xl:max-w-[1600px] xl:px-10">
				<aside className="space-y-2 lg:sticky lg:top-6 lg:self-start">
					<h2 className="hidden font-semibold text-muted-foreground text-xs uppercase tracking-widest lg:block">
						Übersicht
					</h2>
					<WeekPreview
						events={events.map((e) => ({
							id: e.id,
							date: e.date,
							type: e.type,
							isCancelled: e.isCancelled,
						}))}
					/>
					<div className="flex items-center justify-between gap-2 pt-2">
						<CalendarSubscribeButton calendarUrl={calendarUrl} />
						<EventTypeFilter initialHidden={hiddenTypes} />
					</div>
				</aside>

				<div className="mt-6 space-y-6 lg:mt-0">
					{events.length === 0 ? (
						<p className="py-16 text-center text-muted-foreground">
							{allEvents.length === 0
								? "Keine kommenden Termine geplant."
								: "Keine Termine entsprechen deinem Filter."}
						</p>
					) : (
						<div className="space-y-8">
							{grouped.map(({ label, items }) => (
								<div key={label} className="space-y-2">
									<h2 className="font-semibold text-muted-foreground text-xs uppercase tracking-widest">
										{label}
									</h2>
									<div className="divide-y rounded-xl border bg-card">
										{items.map((event) => {
											const time = formatTime(event.date);
											return (
												<div
													key={event.id}
													id={`event-${event.id}`}
													className="flex items-start gap-4 px-4 py-3.5 transition-shadow"
												>
													{/* Date block */}
													<div className="flex w-10 shrink-0 flex-col items-center pt-0.5 text-center">
														<span className="font-bold text-lg tabular-nums leading-none">
															{event.date.getDate()}
														</span>
														<span className="text-[10px] text-muted-foreground uppercase">
															{event.date.toLocaleDateString("de-DE", {
																weekday: "short",
															})}
														</span>
													</div>

													{/* Content */}
													<div className="min-w-0 flex-1 space-y-1">
														<div className="flex flex-wrap items-center gap-2">
															<span className="font-medium text-sm leading-snug">
																{event.isCancelled ? (
																	<span className="line-through opacity-50">
																		{event.title}
																	</span>
																) : (
																	event.title
																)}
															</span>
															{event.isCancelled && (
																<span className="rounded-full bg-red-100 px-2 py-0.5 font-medium text-red-600 text-xs">
																	Abgesagt
																</span>
															)}
															<span
																className={`rounded-full px-2 py-0.5 font-medium text-xs ${TYPE_COLORS[event.type] ?? TYPE_COLORS.Sonstige}`}
															>
																{event.type}
															</span>
														</div>

														<div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
															{time && (
																<span className="flex items-center gap-1">
																	<CalendarDays className="h-3 w-3" />
																	{time}
																</span>
															)}
															{event.location && (
																<span className="flex items-center gap-1">
																	<MapPin className="h-3 w-3" />
																	{event.location}
																</span>
															)}
														</div>

														{event.description && (
															<p className="text-muted-foreground text-xs">
																{event.description}
															</p>
														)}

														{(() => {
															const c = countsMap.get(event.id) ?? {
																yes: 0,
																no: 0,
																maybe: 0,
															};
															return (
																<>
																	<RsvpAttendees
																		eventId={event.id}
																		eventTitle={event.title}
																		preview={previewMap.get(event.id) ?? []}
																		yesCount={c.yes}
																		maybeCount={c.maybe}
																	/>
																	<div className="pt-1.5">
																		<RsvpControls
																			eventId={event.id}
																			isCancelled={event.isCancelled}
																			rsvpDeadline={event.rsvpDeadline}
																			maxAttendees={event.maxAttendees}
																			counts={c}
																			currentStatus={
																				userRsvpMap.get(event.id) ?? null
																			}
																		/>
																	</div>
																</>
															);
														})()}
													</div>
												</div>
											);
										})}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</SidebarLayout>
	);
}
