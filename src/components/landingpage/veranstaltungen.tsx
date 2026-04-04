import { getPublicUpcomingEvents } from "~/server/actions/events/events";

const TYPE_COLORS: Record<string, string> = {
	Kneipe: "text-amber-700",
	Ausflug: "text-green-700",
	Sport: "text-blue-700",
	Offiziell: "text-purple-700",
	Sonstige: "text-[#003366]",
};

function formatDate(d: Date) {
	return d.toLocaleDateString("de-DE", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

const Veranstaltungen = async () => {
	const events = await getPublicUpcomingEvents(6);

	if (events.length === 0) return null;

	return (
		<section className="w-full bg-gray-100 py-12 md:py-24 lg:py-32">
			<div className="container mx-auto space-y-12 px-4 md:px-6">
				<div className="flex flex-col items-center justify-center space-y-4 text-center">
					<div className="space-y-2">
						<h2 className="font-bold text-3xl tracking-tighter sm:text-5xl">
							Kommende Veranstaltungen
						</h2>
					</div>
				</div>
				<div className="flex w-full justify-center">
					<div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
						{events.map((event) => (
							<div
								key={event.id}
								className="flex h-full min-h-44 flex-col gap-2 rounded-lg bg-white p-6 shadow-md"
							>
								<div className="flex items-start justify-between gap-2">
									<h3 className="font-bold text-lg">{event.title}</h3>
									<span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 text-xs">
										{event.type}
									</span>
								</div>
								{event.description && (
									<p className="grow text-gray-500 text-sm">
										{event.description}
									</p>
								)}
								<div className="mt-auto flex items-center justify-between">
									<div
										className={`font-medium text-sm ${TYPE_COLORS[event.type] ?? "text-[#003366]"}`}
									>
										{formatDate(event.date)}
									</div>
									{event.location && (
										<span className="text-gray-400 text-xs">
											{event.location}
										</span>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</section>
	);
};

export default Veranstaltungen;
