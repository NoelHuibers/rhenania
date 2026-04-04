import { CalendarDays, MapPin } from "lucide-react";
import { academicTimeLabel } from "~/lib/academic-time";
import { getPublicUpcomingEvents } from "~/server/actions/events/events";

const TYPE_COLORS: Record<string, string> = {
	Intern: "bg-blue-100 text-blue-800",
	AHV: "bg-amber-100 text-amber-800",
	oCC: "bg-green-100 text-green-800",
	SC: "bg-purple-100 text-purple-800",
	"Jour Fix": "bg-cyan-100 text-cyan-800",
	Stammtisch: "bg-orange-100 text-orange-800",
	Sonstige: "bg-gray-100 text-gray-800",
};

function formatDate(d: Date) {
	return d.toLocaleDateString("de-DE", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

function formatTime(d: Date) {
	const h = d.getHours();
	const m = d.getMinutes();
	if (h === 0 && m === 0) return null;
	return academicTimeLabel(h, m);
}

function relativeLabel(d: Date) {
	const now = new Date();
	const diffDays = Math.round(
		(d.setHours(0, 0, 0, 0) - now.setHours(0, 0, 0, 0)) / 86_400_000,
	);
	if (diffDays === 0) return "Heute";
	if (diffDays === 1) return "Morgen";
	if (diffDays <= 7) return `In ${diffDays} Tagen`;
	return null;
}

const Veranstaltungen = async () => {
	const events = await getPublicUpcomingEvents(6);

	if (events.length === 0) return null;

	return (
		<section className="w-full bg-gray-100 py-12 md:py-24 lg:py-32">
			<div className="container mx-auto space-y-12 px-4 md:px-6">
				<div className="flex flex-col items-center justify-center space-y-2 text-center">
					<h2 className="font-bold text-3xl tracking-tighter sm:text-5xl">
						Kommende Veranstaltungen
					</h2>
					<p className="text-gray-500 text-sm">
						Die nächsten Ereignisse des Verbindungslebens
					</p>
				</div>

				<div className="flex w-full justify-center">
					<div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
						{events.map((event) => {
							const time = formatTime(event.date);
							const label = relativeLabel(new Date(event.date));
							return (
								<div
									key={event.id}
									className="flex h-full min-h-44 flex-col gap-3 rounded-lg bg-white p-6 shadow-md transition-shadow hover:shadow-lg"
								>
									<div className="flex items-start justify-between gap-2">
										<h3 className="font-bold text-lg leading-tight">
											{event.title}
										</h3>
										<span
											className={`shrink-0 rounded-full px-2.5 py-0.5 font-medium text-xs ${TYPE_COLORS[event.type] ?? TYPE_COLORS.Sonstige}`}
										>
											{event.type}
										</span>
									</div>

									{event.description ? (
										<p className="grow text-gray-500 text-sm">
											{event.description}
										</p>
									) : (
										<div className="grow" />
									)}

									<div className="mt-auto space-y-1.5 border-t pt-3">
										<div className="flex items-center gap-1.5 text-gray-600 text-sm">
											<CalendarDays className="h-3.5 w-3.5 shrink-0" />
											<span>{formatDate(event.date)}</span>
											{time && <span className="text-gray-400">· {time}</span>}
											{label && (
												<span className="ml-auto rounded-full bg-[#003366]/10 px-2 py-0.5 font-medium text-[#003366] text-xs">
													{label}
												</span>
											)}
										</div>
										{event.location && (
											<div className="flex items-center gap-1.5 text-gray-400 text-xs">
												<MapPin className="h-3.5 w-3.5 shrink-0" />
												{event.location}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				<div className="flex justify-center">
					<a
						href="/termine"
						className="rounded-md border border-gray-300 bg-white px-5 py-2 text-gray-700 text-sm shadow-sm transition-colors hover:bg-gray-50"
					>
						Alle Termine ansehen
					</a>
				</div>
			</div>
		</section>
	);
};

export default Veranstaltungen;
