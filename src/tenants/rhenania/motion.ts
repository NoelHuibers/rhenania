"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";

let registered = false;

export function ensureGsap() {
	if (!registered && typeof window !== "undefined") {
		gsap.registerPlugin(ScrollTrigger);
		registered = true;
	}
	return { gsap, ScrollTrigger };
}

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

// Reveal the elements marked with [data-animate] inside the returned ref on
// scroll-into-view. Uses IntersectionObserver (not ScrollTrigger) so it stays
// reliable on mobile, where the dynamic toolbar resizing throws scroll-position
// math off. A safety timeout guarantees the content is shown even if the
// observer never fires, so nothing can ever stay stuck hidden. Under
// reduced-motion (or if JS fails) content is simply left visible.
export function useReveal<T extends HTMLElement = HTMLDivElement>(options?: {
	y?: number;
	stagger?: number;
	start?: string;
}) {
	const ref = useRef<T>(null);

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();

		const items = el.querySelectorAll<HTMLElement>("[data-animate]");
		const targets = items.length ? Array.from(items) : [el];

		gsap.set(targets, { y: options?.y ?? 44, opacity: 0 });

		let played = false;
		const play = () => {
			if (played) return;
			played = true;
			gsap.to(targets, {
				y: 0,
				opacity: 1,
				duration: 0.9,
				ease: "power3.out",
				stagger: options?.stagger ?? 0.12,
				overwrite: true,
			});
		};

		if (typeof IntersectionObserver === "undefined") {
			play();
			return;
		}

		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						play();
						io.disconnect();
						break;
					}
				}
			},
			{ rootMargin: "0px 0px -8% 0px", threshold: 0.04 },
		);
		io.observe(el);

		// Safety net: never leave content hidden if the observer never fires.
		const safety = window.setTimeout(() => {
			play();
			io.disconnect();
		}, 2500);

		return () => {
			io.disconnect();
			window.clearTimeout(safety);
			gsap.set(targets, { clearProps: "transform,opacity" });
		};
	}, [options?.y, options?.stagger]);

	return ref;
}
