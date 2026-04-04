const QUARTERS = [
	{ minutes: 0, label: "s.t." },
	{ minutes: 15, label: "c.t." },
	{ minutes: 30, label: "m.c.t." },
	{ minutes: 45, label: "m.m.c.t." },
] as const;

export function academicTimeLabel(hours: number, minutes: number): string {
	const quarter = QUARTERS.find((q) => q.minutes === minutes);
	if (!quarter) {
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")} Uhr`;
	}
	return `${hours} Uhr ${quarter.label}`;
}
