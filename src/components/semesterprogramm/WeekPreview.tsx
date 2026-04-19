"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const TYPE_DOT_COLORS: Record<string, string> = {
	Intern: "bg-blue-500",
	AHV: "bg-amber-500",
	oCC: "bg-green-500",
	SC: "bg-purple-500",
	"Jour Fix": "bg-cyan-500",
	Stammtisch: "bg-orange-500",
	Sonstige: "bg-gray-400",
};

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const WEEKS = 5;

export type WeekPreviewEvent = {
	id: string;
	date: Date;
	type: string;
	isCancelled: boolean;
};

function startOfDay(d: Date) {
	const c = new Date(d);
	c.setHours(0, 0, 0, 0);
	return c;
}

function startOfWeek(d: Date) {
	const c = startOfDay(d);
	const day = c.getDay(); // 0 = Sun
	const diff = (day + 6) % 7; // back to Monday
	c.setDate(c.getDate() - diff);
	return c;
}

function sameDay(a: Date, b: Date) {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function WeekPreview({ events }: { events: WeekPreviewEvent[] }) {
	const today = startOfDay(new Date());
	const baseStart = startOfWeek(today);
	const [weekOffset, setWeekOffset] = useState(0);

	const start = new Date(baseStart);
	start.setDate(baseStart.getDate() + weekOffset * 7);

	const days: Date[] = [];
	for (let i = 0; i < WEEKS * 7; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		days.push(d);
	}

	const end = days[days.length - 1] ?? start;
	const rangeLabel = (() => {
		const sameYear = start.getFullYear() === end.getFullYear();
		const sameMonth = sameYear && start.getMonth() === end.getMonth();
		const startLabel = start.toLocaleDateString("de-DE", {
			day: "numeric",
			month: "short",
			...(sameYear ? {} : { year: "numeric" }),
		});
		const endLabel = end.toLocaleDateString("de-DE", {
			day: "numeric",
			month: sameMonth ? undefined : "short",
			year: "numeric",
		});
		return `${startLabel} – ${endLabel}`;
	})();

	const eventsByDay = new Map<string, WeekPreviewEvent[]>();
	for (const e of events) {
		const key = startOfDay(e.date).toISOString();
		const list = eventsByDay.get(key) ?? [];
		list.push(e);
		eventsByDay.set(key, list);
	}

	function scrollToEvent(eventId: string) {
		const el = document.getElementById(`event-${eventId}`);
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "center" });
		el.classList.add("ring-2", "ring-primary", "ring-offset-2");
		setTimeout(() => {
			el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
		}, 1600);
	}

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<span className="text-muted-foreground text-xs tabular-nums">
					{rangeLabel}
				</span>
				<div className="flex items-center gap-0.5">
					{weekOffset !== 0 && (
						<button
							type="button"
							onClick={() => setWeekOffset(0)}
							className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider hover:bg-muted hover:text-foreground"
						>
							Heute
						</button>
					)}
					<button
						type="button"
						onClick={() => setWeekOffset(weekOffset - WEEKS)}
						className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Vorherige Wochen"
					>
						<ChevronLeft className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={() => setWeekOffset(weekOffset + WEEKS)}
						className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Nächste Wochen"
					>
						<ChevronRight className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>
			<div className="grid grid-cols-7 gap-0.5">
				{WEEKDAYS.map((w) => (
					<div
						key={w}
						className="text-center text-[9px] text-muted-foreground uppercase"
					>
						{w}
					</div>
				))}
			</div>
			<div className="grid grid-cols-7 gap-0.5">
				{days.map((day) => {
					const key = startOfDay(day).toISOString();
					const dayEvents = eventsByDay.get(key) ?? [];
					const isPast = day < today;
					const isToday = sameDay(day, today);
					const hasEvents = dayEvents.length > 0;
					const firstEvent = dayEvents[0];

					const dots = dayEvents
						.slice(0, 3)
						.map(
							(e) => TYPE_DOT_COLORS[e.type] ?? TYPE_DOT_COLORS.Sonstige ?? "",
						);
					const overflow = dayEvents.length > 3;

					const baseClass =
						"relative flex h-9 flex-col items-center justify-center rounded-md text-xs transition-colors sm:h-10";
					const stateClass = isToday
						? "bg-muted font-semibold text-foreground ring-1 ring-foreground/30"
						: hasEvents
							? "bg-muted/50 hover:bg-muted"
							: "text-muted-foreground/50";
					const pastClass = isPast && !isToday ? "opacity-40" : "";
					const interactiveClass = hasEvents ? "cursor-pointer" : "";

					const content = (
						<>
							<span className="tabular-nums leading-none">{day.getDate()}</span>
							{hasEvents && (
								<div className="mt-0.5 flex items-center gap-px">
									{dots.map((c, i) => (
										<span
											// biome-ignore lint/suspicious/noArrayIndexKey: dots are positional
											key={i}
											className={`size-1 rounded-full ${c}`}
										/>
									))}
									{overflow && (
										<span className="size-1 rounded-full bg-muted-foreground/60" />
									)}
								</div>
							)}
						</>
					);

					if (hasEvents && firstEvent) {
						return (
							<button
								type="button"
								key={key}
								onClick={() => scrollToEvent(firstEvent.id)}
								className={`${baseClass} ${stateClass} ${pastClass} ${interactiveClass}`}
								title={
									dayEvents.length === 1
										? "1 Termin"
										: `${dayEvents.length} Termine`
								}
							>
								{content}
							</button>
						);
					}
					return (
						<div
							key={key}
							className={`${baseClass} ${stateClass} ${pastClass}`}
						>
							{content}
						</div>
					);
				})}
			</div>
		</div>
	);
}
