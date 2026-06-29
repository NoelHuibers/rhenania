"use client";

import Image from "next/image";
import { useLayoutEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion, useReveal } from "../motion";

export function Haus({ images }: { images: string[] }) {
	const reveal = useReveal<HTMLDivElement>();
	const section = useRef<HTMLDivElement>(null);
	const bg = useRef<HTMLDivElement>(null);

	const hero = images[0] ?? "/Haus0.png";
	const thumbs = images.slice(1, 5);

	useLayoutEffect(() => {
		const el = section.current;
		const layer = bg.current;
		if (!el || !layer || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();
		const ctx = gsap.context(() => {
			gsap.fromTo(
				layer,
				{ yPercent: -12 },
				{
					yPercent: 12,
					ease: "none",
					scrollTrigger: {
						trigger: el,
						start: "top bottom",
						end: "bottom top",
						scrub: true,
					},
				},
			);
		}, el);
		return () => ctx.revert();
	}, []);

	return (
		<section
			ref={section}
			className="relative w-full overflow-hidden px-6 py-20 md:py-40"
		>
			{/* Parallax backdrop */}
			<div ref={bg} className="absolute inset-0 -z-10 scale-125">
				<Image
					src={hero}
					alt="Unser Haus"
					fill
					sizes="100vw"
					className="object-cover opacity-45"
					unoptimized={hero.endsWith(".gif")}
				/>
			</div>
			<div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#faf6f4] via-[#faf6f4]/75 to-[#faf6f4]" />

			<div ref={reveal} className="mx-auto max-w-3xl text-center">
				<p
					data-animate
					className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.4em]"
				>
					Stadtmitte · Halbhöhenlage
				</p>
				<h2
					data-animate
					className="mt-4 font-heading font-semibold text-4xl text-[#2c2630] tracking-tight sm:text-6xl"
				>
					Unser Haus
				</h2>
				<p
					data-animate
					className="mt-6 text-balance text-[#2c2630]/80 text-lg leading-relaxed"
				>
					Unser Haus liegt in der Nähe des Universitätszentrums Stadtmitte in
					schöner nördlicher Halbhöhenlage, etwa 10 Gehminuten vom Hauptbahnhof
					entfernt. Die sehr gute Anbindung an die Campusuniversitäten Vaihingen
					und Hohenheim ermöglicht das Wohnen und Feiern in der Landeshauptstadt
					und das Studieren am Campus.
				</p>
			</div>

			{thumbs.length > 0 && (
				<div className="mx-auto mt-14 grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4">
					{thumbs.map((src) => (
						<div
							key={src}
							className="relative aspect-[4/3] overflow-hidden rounded-xl border border-black/5 shadow-[0_8px_24px_-14px_rgba(44,38,48,0.35)]"
						>
							<Image
								src={src}
								alt="Rhenanenhaus"
								fill
								sizes="(max-width: 768px) 50vw, 25vw"
								className="object-cover transition-transform duration-700 hover:scale-110"
								unoptimized={src.endsWith(".gif")}
							/>
						</div>
					))}
				</div>
			)}
		</section>
	);
}
