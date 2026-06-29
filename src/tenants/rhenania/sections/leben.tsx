"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion, useReveal } from "../motion";

// Asymmetric layout offsets/speeds for the collage tiles (cycled over images).
const TILES = [
	{ className: "col-span-2 row-span-2 aspect-square", speed: -6 },
	{ className: "col-span-1 row-span-1 aspect-[3/4] mt-8", speed: 10 },
	{ className: "col-span-1 row-span-1 aspect-[3/4]", speed: -10 },
	{ className: "col-span-2 row-span-1 aspect-[2/1]", speed: 6 },
];

export function Leben({ images }: { images: string[] }) {
	const reveal = useReveal<HTMLDivElement>();
	const grid = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const el = grid.current;
		if (!el || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();
		const ctx = gsap.context(() => {
			el.querySelectorAll<HTMLElement>("[data-parallax]").forEach((tile) => {
				const speed = Number(tile.dataset.speed ?? 0);
				gsap.to(tile, {
					yPercent: speed,
					ease: "none",
					scrollTrigger: {
						trigger: el,
						start: "top bottom",
						end: "bottom top",
						scrub: true,
					},
				});
			});
		}, el);
		return () => ctx.revert();
	}, []);

	return (
		<section id="leben" className="relative w-full px-6 py-16 md:py-36">
			<div ref={reveal} className="mx-auto max-w-3xl text-center">
				<p
					data-animate
					className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.4em]"
				>
					Aktivität
				</p>
				<h2
					data-animate
					className="mt-4 font-heading font-semibold text-4xl text-[#2c2630] tracking-tight sm:text-6xl"
				>
					Leben als Rhenane
				</h2>
				<p
					data-animate
					className="mt-6 text-balance text-[#6f6675] text-lg leading-relaxed"
				>
					Unsere Aktiven erleben viele unvergessliche Momente, die sie während
					ihrer Studienzeit begleiten. Von dem alltäglichen wie gemeinsames
					Lernen, Kochen, Feiern und Sport bis hin zum Segeln, Skifahren und
					Reisen.
				</p>
			</div>

			<div
				ref={grid}
				className="mx-auto mt-16 grid max-w-5xl auto-rows-auto grid-cols-2 gap-4 md:grid-cols-4 md:gap-6"
			>
				{images.slice(0, 4).map((src, i) => {
					const tile = TILES[i % TILES.length] ?? TILES[0];
					if (!tile) return null;
					return (
						<div
							key={src}
							data-parallax
							data-speed={tile.speed}
							className={`relative overflow-hidden rounded-2xl border border-black/5 shadow-[0_10px_30px_-14px_rgba(44,38,48,0.3)] ${tile.className}`}
						>
							<Image
								src={src}
								alt="Leben als Rhenane"
								fill
								sizes="(max-width: 768px) 50vw, 33vw"
								className="object-cover transition-transform duration-700 hover:scale-105"
								unoptimized={src.endsWith(".gif")}
							/>
						</div>
					);
				})}
			</div>
		</section>
	);
}
