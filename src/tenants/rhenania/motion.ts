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
// scroll-into-view. Content is visible by default (no CSS opacity:0), so if JS
// fails or reduced-motion is on, nothing is hidden.
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

		const ctx = gsap.context(() => {
			const items = el.querySelectorAll("[data-animate]");
			const targets = items.length ? items : [el];
			gsap.from(targets, {
				y: options?.y ?? 44,
				opacity: 0,
				duration: 0.9,
				ease: "power3.out",
				stagger: options?.stagger ?? 0.12,
				scrollTrigger: {
					trigger: el,
					start: options?.start ?? "top 80%",
				},
			});
		}, el);

		return () => ctx.revert();
	}, [options?.y, options?.stagger, options?.start]);

	return ref;
}
