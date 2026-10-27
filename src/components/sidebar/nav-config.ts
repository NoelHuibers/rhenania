import {
	Beer,
	BookUser,
	BottleWine,
	CalendarDays,
	Camera,
	Candy,
	HandCoins,
	Landmark,
	PiggyBank,
	ReceiptEuro,
	ReceiptText,
	Settings,
	ShoppingBag,
	Swords,
	Trophy,
	Truck,
} from "lucide-react";
import { ADRESSLISTE_ROLES } from "~/lib/roles";

export type Role = "Admin" | "Getränkewart" | string;

export type NavItem = {
	title: string;
	href: string;
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	roles: Role[];
};

export type NavGroup = {
	label: string;
	items: NavItem[];
};

/** Sidebar navigation, grouped; `roles: []` means visible to everyone. */
export const navGroups: NavGroup[] = [
	{
		label: "Getränke",
		items: [
			{ title: "Trinken", href: "/trinken", icon: BottleWine, roles: [] },
			{
				title: "Rechnungen",
				href: "/rechnungen",
				icon: ReceiptEuro,
				roles: [],
			},
			{
				title: "Bestellungen",
				href: "/bestellungen",
				icon: ReceiptText,
				roles: [],
			},
			{
				title: "Getränkewart",
				href: "/getraenkewart",
				icon: Truck,
				roles: ["Getränkewart", "Admin"],
			},
		],
	},
	{
		label: "Fuchsenladen",
		items: [
			{
				title: "Laden",
				href: "/fuchsenladen",
				icon: Candy,
				roles: [],
			},
			{
				title: "Rechnungen",
				href: "/fuchsenrechnungen",
				icon: ReceiptEuro,
				roles: [],
			},
			{
				title: "Bestellungen",
				href: "/fuchsenbestellungen",
				icon: ReceiptText,
				roles: [],
			},
			{
				title: "Fuchsenwart",
				href: "/fuchsenwart",
				icon: ShoppingBag,
				roles: ["Fuchs", "Admin"],
			},
		],
	},
	{
		label: "Allgemein",
		items: [
			{
				title: "Semesterprogramm",
				href: "/semesterprogramm",
				icon: CalendarDays,
				roles: [],
			},
			{
				title: "Kostenerstattung",
				href: "/kostenerstattung",
				icon: HandCoins,
				roles: [],
			},
			{ title: "Literboard", href: "/leaderboard", icon: Trophy, roles: [] },
			{ title: "Eloranking", href: "/eloranking", icon: Beer, roles: [] },
			{
				title: "Herausforderungen",
				href: "/challenges",
				icon: Swords,
				roles: [],
			},
		],
	},
	{
		label: "Verwaltung",
		items: [
			{
				title: "Bilder",
				href: "/bilder",
				icon: Camera,
				roles: ["Admin", "Fotowart"],
			},
			{
				title: "Veranstaltungen",
				href: "/admin/semesterprogramm",
				icon: CalendarDays,
				roles: ["Admin"],
			},
			{
				title: "Konten",
				href: "/konten",
				icon: Landmark,
				roles: ["Admin", "Getränkewart", "CC-Kasse", "Aktivenkasse"],
			},
			{
				title: "CC-Kasse",
				href: "/cc-kasse",
				icon: PiggyBank,
				roles: ["CC-Kasse", "Senior", "Admin"],
			},
			{
				title: "Adressliste",
				href: "/adressliste",
				icon: BookUser,
				roles: ADRESSLISTE_ROLES,
			},
			{ title: "Admin", href: "/admin", icon: Settings, roles: ["Admin"] },
		],
	},
];
