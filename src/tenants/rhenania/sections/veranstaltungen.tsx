"use client";

import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";
import type { LandingEvent } from "../experience";
import { useReveal } from "../motion";
import { CouleurDivider } from "./couleur-divider";

// Badge colors per event type (light theme).
const TYPE_COLORS: Record<string, string> = {
	Intern: "bg-blue-50 text-blue-700 ring-blue-200",
	AHV: "bg-amber-50 text-amber-700 ring-amber-200",
	oCC: "bg-emerald-50 text-emerald-700 ring-emerald-200",
	SC: "bg-purple-50 text-purple-700 ring-purple-200",
	"Jour Fix": "bg-cyan-50 text-cyan-700 ring-cyan-200",
	Stammtisch: "bg-orange-50 text-orange-700 ring-orange-200",
	Sonstige: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export function Veranstaltungen({ events }: { events: LandingEvent[] }) {
	const reveal = useReveal<HTMLDivElement>({ start: "top 85%" });

	if (events.length === 0) return null;

	return (
		<section className="relative w-full px-6 py-16 md:py-32">
			<CouleurDivider />
			<div className="mx-auto max-w-3xl text-center">
				<h2 className="font-heading font-semibold text-4xl text-[#2c2630] tracking-tight sm:text-5xl">
					Kommende Veranstaltungen
				</h2>
				<p className="mt-3 text-[#6f6675] text-sm tracking-wide">
					Die nächsten Ereignisse des Verbindungslebens
				</p>
			</div>

			<div
				ref={reveal}
				className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
			>
				{events.map((event) => (
					<article
						key={event.id}
						data-animate
						className="group flex h-full min-h-44 flex-col gap-3 rounded-2xl border border-black/5 bg-white p-6 shadow-[0_2px_20px_-10px_rgba(44,38,48,0.25)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_14px_34px_-14px_rgba(47,134,212,0.4)] hover:ring-1 hover:ring-[#2f86d4]/30"
					>
						<div className="flex items-start justify-between gap-2">
							<h3 className="font-heading font-semibold text-[#2c2630] text-lg leading-tight">
								{event.title}
							</h3>
							<span
								className={`shrink-0 rounded-full px-2.5 py-0.5 font-medium text-xs ring-1 ring-inset ${TYPE_COLORS[event.type] ?? TYPE_COLORS.Sonstige}`}
							>
								{event.type}
							</span>
						</div>

						{event.description ? (
							<p className="grow text-[#6f6675] text-sm leading-relaxed">
								{event.description}
							</p>
						) : (
							<div className="grow" />
						)}

						<div className="mt-auto space-y-1.5 border-black/5 border-t pt-3">
							<div className="flex items-center gap-1.5 text-[#2c2630]/75 text-sm">
								<CalendarDays className="h-3.5 w-3.5 shrink-0" />
								<span>{event.fullDate}</span>
								{event.time && (
									<span className="text-[#6f6675]">· {event.time}</span>
								)}
								{event.relativeLabel && (
									<span className="ml-auto rounded-full bg-[#2f86d4]/10 px-2 py-0.5 font-medium text-[#1c63ad] text-xs">
										{event.relativeLabel}
									</span>
								)}
							</div>
							{event.location && (
								<div className="flex items-center gap-1.5 text-[#6f6675] text-xs">
									<MapPin className="h-3.5 w-3.5 shrink-0" />
									{event.location}
								</div>
							)}
						</div>
					</article>
				))}
			</div>

			<div className="mt-12 flex justify-center">
				<Link
					href="/semesterprogramm"
					className="rounded-full border border-[#2c2630]/15 px-6 py-2.5 text-[#2c2630]/80 text-sm transition-colors hover:border-[#2f86d4] hover:text-[#2f86d4]"
				>
					Alle Termine ansehen
				</Link>
			</div>
		</section>
	);
}
