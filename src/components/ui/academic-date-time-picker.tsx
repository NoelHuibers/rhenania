"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { academicTimeLabel } from "~/lib/academic-time";
import { cn } from "~/lib/utils";

const QUARTERS = [
	{ minutes: 0, label: "s.t.", title: "sine tempore – pünktlich" },
	{ minutes: 15, label: "c.t.", title: "cum tempore – akademisches Viertel" },
	{ minutes: 30, label: "m.c.t.", title: "media cum tempore – halbe Stunde" },
	{
		minutes: 45,
		label: "m.m.c.t.",
		title: "minima cum tempore – dreiviertel Stunde",
	},
] as const;

/** Parses a "YYYY-MM-DDTHH:MM" string into { date, hours, minutes } */
function parseValue(value: string) {
	if (!value) return { date: undefined, hours: 20, minutes: 0 };
	const d = new Date(value);
	if (Number.isNaN(d.getTime()))
		return { date: undefined, hours: 20, minutes: 0 };
	return { date: d, hours: d.getHours(), minutes: d.getMinutes() };
}

/** Serialises back to "YYYY-MM-DDTHH:MM" (local time) */
function toInputValue(date: Date, hours: number, minutes: number): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}`;
}

interface Props {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}

export function AcademicDateTimePicker({
	value,
	onChange,
	placeholder = "Datum & Uhrzeit wählen",
	className,
}: Props) {
	const { date, hours, minutes } = parseValue(value);
	const [open, setOpen] = useState(false);
	const [localHours, setLocalHours] = useState(hours);

	function handleDaySelect(selected: Date | undefined) {
		if (!selected) return;
		onChange(toInputValue(selected, localHours, minutes));
	}

	function handleHourChange(h: number) {
		setLocalHours(h);
		if (!date) return;
		onChange(toInputValue(date, h, minutes));
	}

	function handleQuarterSelect(mins: number) {
		if (!date) return;
		onChange(toInputValue(date, localHours, mins));
		setOpen(false);
	}

	const displayLabel = date
		? `${date.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })} · ${academicTimeLabel(localHours, minutes)}`
		: placeholder;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					className={cn(
						"w-full justify-start text-left font-normal",
						!date && "text-muted-foreground",
						className,
					)}
				>
					<CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
					{displayLabel}
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={date}
					onSelect={handleDaySelect}
					initialFocus
				/>
				<div className="space-y-3 border-t p-3">
					{/* Hour picker */}
					<div className="flex items-center gap-2">
						<span className="w-10 shrink-0 text-muted-foreground text-sm">
							Stunde
						</span>
						<input
							type="number"
							min={0}
							max={23}
							value={localHours}
							onChange={(e) => {
								const h = Math.max(0, Math.min(23, Number(e.target.value)));
								handleHourChange(h);
							}}
							className="w-16 rounded-md border px-2 py-1 text-center text-sm"
						/>
					</div>
					{/* Academic quarter selector */}
					<div className="flex items-center gap-2">
						<span className="w-10 shrink-0 text-muted-foreground text-sm">
							Zeit
						</span>
						<div className="flex flex-wrap gap-1">
							{QUARTERS.map((q) => (
								<Button
									key={q.minutes}
									type="button"
									size="sm"
									variant={minutes === q.minutes ? "default" : "outline"}
									title={q.title}
									onClick={() => handleQuarterSelect(q.minutes)}
									className="px-2 text-xs"
								>
									{q.label}
								</Button>
							))}
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	);
}
