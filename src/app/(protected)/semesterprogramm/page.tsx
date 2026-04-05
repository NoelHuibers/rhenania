import { CalendarDays, MapPin } from "lucide-react";
import { headers } from "next/headers";
import { CalendarActions } from "~/components/landingpage/CalendarActions";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { academicTimeLabel } from "~/lib/academic-time";
import { getUpcomingEvents } from "~/server/actions/events/events";

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
	const events = await getUpcomingEvents();
	const host = (await headers()).get("host") ?? "localhost:3000";
	const protocol = host.startsWith("localhost") ? "http" : "https";
	const calendarUrl = `${protocol}://${host}/api/calendar`;

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
			<div className="mx-auto max-w-2xl space-y-8 p-6">
				<CalendarActions calendarUrl={calendarUrl} />

				{events.length === 0 ? (
					<p className="py-16 text-center text-muted-foreground">
						Keine kommenden Termine geplant.
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
												className="flex items-start gap-4 px-4 py-3.5"
											>
												{/* Date block */}
												<div className="flex w-10 shrink-0 flex-col items-center pt-0.5 text-center">
													<span className="text-lg font-bold leading-none tabular-nums">
														{event.date.getDate()}
													</span>
													<span className="text-[10px] uppercase text-muted-foreground">
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
		</SidebarLayout>
	);
}
