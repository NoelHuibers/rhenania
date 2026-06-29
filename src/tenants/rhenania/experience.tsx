"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ensureGsap, prefersReducedMotion } from "./motion";
import { Bewirb } from "./sections/bewirb";
import { Corps } from "./sections/corps";
import { Haus } from "./sections/haus";
import { Hero } from "./sections/hero";
import { Leben } from "./sections/leben";
import { SiteFooter } from "./sections/site-footer";
import { SiteHeader } from "./sections/site-header";
import { Veranstaltungen } from "./sections/veranstaltungen";
import type { SharedMotion } from "./webgl/scene";

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
};

const CanvasBackground = dynamic(() => import("./webgl/canvas-background"), {
	ssr: false,
});

function detectWebgl(): boolean {
	try {
		const canvas = document.createElement("canvas");
		return !!(
			canvas.getContext("webgl2") ||
			canvas.getContext("webgl") ||
			canvas.getContext("experimental-webgl")
		);
	} catch {
		return false;
	}
}

export default function RhenaniaExperience({
	displayName,
	heroImageUrl,
	ctaImageUrl,
	aktiveImages,
	hausImages,
	events,
}: RhenaniaExperienceProps) {
	// One mutable object shared with the render loop (mutated, never replaced).
	const shared = useRef<SharedMotion>({
		scroll: 0,
		pointerX: 0,
		pointerY: 0,
	}).current;

	const [mounted, setMounted] = useState(false);
	const [webglOk, setWebglOk] = useState(false);
	const [reduced, setReduced] = useState(false);
	const [quality, setQuality] = useState<"low" | "high">("high");
	const [dpr, setDpr] = useState<[number, number]>([1, 2]);

	useEffect(() => {
		ensureGsap();
		setReduced(prefersReducedMotion());
		setWebglOk(detectWebgl());

		const coarse = window.matchMedia("(pointer: coarse)").matches;
		const small = window.innerWidth < 768;
		if (coarse || small) {
			setQuality("low");
			setDpr([1, 1.5]);
		}
		setMounted(true);
	}, []);

	useEffect(() => {
		const onScroll = () => {
			shared.scroll = window.scrollY / Math.max(1, window.innerHeight);
		};
		const onPointer = (e: PointerEvent) => {
			shared.pointerX = (e.clientX / window.innerWidth) * 2 - 1;
			shared.pointerY = -((e.clientY / window.innerHeight) * 2 - 1);
		};
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("pointermove", onPointer, { passive: true });
		return () => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("pointermove", onPointer);
		};
	}, [shared]);

	// Recompute every ScrollTrigger position after late layout shifts (fonts,
	// images, the canvas mounting) so reveals further down the page — e.g. the
	// "Das Corps" cards below the parallax house section — aren't left hidden.
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

	const showCanvas = mounted && webglOk;

	return (
		<div className="relative min-h-screen bg-[#faf6f4] text-[#2c2630]">
			{showCanvas && (
				<div className="pointer-events-none fixed inset-0 z-0">
					<CanvasBackground
						shared={shared}
						reducedMotion={reduced}
						quality={quality}
						dpr={dpr}
					/>
				</div>
			)}

			<SiteHeader displayName={displayName} />

			<main className="relative z-10">
				<Hero heroImageUrl={heroImageUrl} hasCanvas={showCanvas} />

				{/* Solid backdrop scrolls over the fixed canvas past the hero. */}
				<div className="relative z-10 bg-[#faf6f4]">
					<Leben images={aktiveImages} />
					<Veranstaltungen events={events} />
					<Haus images={hausImages} />
					<Corps />
					<Bewirb ctaImageUrl={ctaImageUrl} />
				</div>
			</main>

			<SiteFooter />
		</div>
	);
}
