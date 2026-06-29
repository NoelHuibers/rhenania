"use client";

import { BookOpenIcon, ShieldCheck, Users } from "lucide-react";
import type { ComponentType } from "react";
import { useReveal } from "../motion";
import { CouleurDivider } from "./couleur-divider";

interface Pillar {
	Icon: ComponentType<{ className?: string }>;
	title: string;
	description: string;
	iconColor: string;
	iconBg: string;
	glow: string;
}

const PILLARS: Pillar[] = [
	{
		Icon: BookOpenIcon,
		title: "Erfolgreiches studieren",
		description:
			"Gemeinschaft mit einem klaren Fokus auf akademischen Erfolg. Wir lernen und feiern gemeinsam!",
		iconColor: "text-[#b85d7c]",
		iconBg: "bg-[#d98aa6]/12",
		glow: "group-hover:shadow-[0_18px_44px_-16px_rgba(184,93,124,0.5)]",
	},
	{
		Icon: Users,
		title: "Verantwortung übernehmen",
		description:
			"Übernimm Verantwortung bei uns und hab Spaß dabei, dich zu engagieren. Das Haus wird weitgehend von den Bewohnern selbst verwaltet.",
		iconColor: "text-[#9097a6]",
		iconBg: "bg-[#9097a6]/12",
		glow: "group-hover:shadow-[0_18px_44px_-16px_rgba(144,151,166,0.5)]",
	},
	{
		Icon: ShieldCheck,
		title: "Tolerante Gemeinschaft",
		description:
			"Das Corps ist eine tolerante und liberale Gemeinschaft von Studenten und Alumni. Wir sind unpolitisch und nicht konfessionell.",
		iconColor: "text-[#2f86d4]",
		iconBg: "bg-[#2f86d4]/12",
		glow: "group-hover:shadow-[0_18px_44px_-16px_rgba(47,134,212,0.55)]",
	},
];

export function Corps() {
	const reveal = useReveal<HTMLDivElement>({ start: "top 80%" });

	return (
		<section className="relative w-full px-6 py-16 md:py-32">
			<CouleurDivider />
			<div className="mx-auto max-w-3xl text-center">
				<h2 className="font-heading font-semibold text-4xl text-[#2c2630] tracking-tight sm:text-6xl">
					Das Corps
				</h2>
			</div>

			<div
				ref={reveal}
				className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3"
			>
				{PILLARS.map(
					({ Icon, title, description, iconColor, iconBg, glow }) => (
						<div
							key={title}
							data-animate
							className={`group relative flex h-full flex-col rounded-2xl border border-black/5 bg-white p-8 shadow-[0_2px_20px_-12px_rgba(44,38,48,0.25)] transition-all duration-300 hover:-translate-y-2 ${glow}`}
						>
							<div
								className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl ${iconBg}`}
							>
								<Icon className={`h-6 w-6 ${iconColor}`} />
							</div>
							<h3 className="font-heading font-semibold text-[#2c2630] text-xl">
								{title}
							</h3>
							<p className="mt-3 grow text-[#6f6675] leading-relaxed">
								{description}
							</p>
						</div>
					),
				)}
			</div>

			<p className="mx-auto mt-14 max-w-3xl text-balance text-center font-heading font-medium text-[#2c2630]/90 text-xl sm:text-2xl">
				Schließe dich uns an, um ein Umfeld für ein erfolgreiches, glückliches
				und einzigartiges Studium zu schaffen!
			</p>
		</section>
	);
}
