export const KASSE_TYPES = [
	"Getränkekasse",
	"Aktivenkasse",
	"CC-Kasse",
	"Fuchsenkasse",
	"AHV Kasse",
	"Hausverein Kasse",
] as const;

export type KasseType = (typeof KASSE_TYPES)[number];
