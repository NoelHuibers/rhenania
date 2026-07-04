"use client";

import { Fraunces } from "next/font/google";
import type { CSSProperties } from "react";
import { useEffect } from "react";
import { ensureGsap } from "./motion";
import { Bewirb } from "./sections/bewirb";
import { Corps } from "./sections/corps";
import { Haus } from "./sections/haus";
import { Hero } from "./sections/hero";
import { Leben } from "./sections/leben";
import { SiteFooter } from "./sections/site-footer";
import { SiteHeader } from "./sections/site-header";
import { Veranstaltungen } from "./sections/veranstaltungen";

// Editorial display serif for the landing page. Scoped here (not in the root
// layout) so the app behind the login keeps its Geist headings — the
// `--font-heading` override below only applies inside this tree.
const fraunces = Fraunces({
	subsets: ["latin"],
	style: ["normal", "italic"],
	axes: ["opsz"],
	display: "swap",
	variable: "--font-display",
});

export type LandingEvent = {
	id: string;
	title: string;
	type: string;
	description: string | null;
	location: string | null;
	fullDate: string;
	time: string | null;
	relativeLabel: string | null;
};

export type RhenaniaExperienceProps = {
	displayName: string;
	heroImageUrl: string;
	ctaImageUrl: string;
	aktiveImages: string[];
	hausImages: string[];
	events: LandingEvent[];
	eventsArePast: boolean;
};

export default function RhenaniaExperience({
	displayName,
	heroImageUrl,
	ctaImageUrl,
	aktiveImages,
	hausImages,
	events,
	eventsArePast,
}: RhenaniaExperienceProps) {
	// Recompute every ScrollTrigger position after late layout shifts (fonts,
	// images) so reveals further down the page — e.g. the "Das Corps" cards
	// below the parallax house section — aren't left hidden.
	useEffect(() => {
		const { ScrollTrigger } = ensureGsap();
		const refresh = () => ScrollTrigger.refresh();
		window.addEventListener("load", refresh);
		const t1 = window.setTimeout(refresh, 500);
		const t2 = window.setTimeout(refresh, 1800);
		return () => {
			window.removeEventListener("load", refresh);
			window.clearTimeout(t1);
			window.clearTimeout(t2);
		};
	}, []);

	return (
		<div
			className={`${fraunces.variable} relative min-h-screen bg-[#faf6f4] text-[#2c2630]`}
			style={{ "--font-heading": "var(--font-display)" } as CSSProperties}
		>
			<SiteHeader displayName={displayName} />

			<main className="relative">
				<Hero heroImageUrl={heroImageUrl} />
				<Leben images={aktiveImages} />
				<Veranstaltungen events={events} past={eventsArePast} />
				<Haus images={hausImages} />
				<Corps />
				<Bewirb ctaImageUrl={ctaImageUrl} />
			</main>

			<SiteFooter />
		</div>
	);
}
