"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion } from "../motion";

export function Hero({
	heroImageUrl,
	hasCanvas,
}: {
	heroImageUrl: string;
	hasCanvas: boolean;
}) {
	const root = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const el = root.current;
		if (!el || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();

		const ctx = gsap.context(() => {
			const words = el.querySelectorAll("[data-word]");
			const fades = el.querySelectorAll("[data-fade]");
			const tl = gsap.timeline({ delay: 0.5 });
			tl.from(words, {
				yPercent: 120,
				opacity: 0,
				duration: 1.1,
				ease: "expo.out",
				stagger: 0.09,
			});
			tl.from(
				fades,
				{ y: 20, opacity: 0, duration: 0.9, ease: "power3.out", stagger: 0.15 },
				"-=0.5",
			);
		}, el);

		return () => ctx.revert();
	}, []);

	return (
		<section
			ref={root}
			className="relative flex min-h-[100svh] w-full flex-col items-center justify-end overflow-hidden pb-20 text-center"
		>
			{/* Static fallback backdrop when WebGL is unavailable. */}
			{!hasCanvas && (
				<>
					<Image
						src={heroImageUrl}
						alt=""
						fill
						priority
						sizes="100vw"
						className="-z-10 object-cover opacity-50"
						unoptimized={heroImageUrl.endsWith(".gif")}
					/>
					<div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#faf6f4]/60 via-[#faf6f4]/55 to-[#faf6f4]" />
					<Image
						src="/zirkel.svg"
						alt="Zirkel des Corps Rhenania"
						width={220}
						height={220}
						className="absolute top-[24%] left-1/2 -z-10 h-auto w-40 -translate-x-1/2 opacity-80 sm:w-52"
					/>
				</>
			)}

			{/* Bottom wash keeps the headline legible over the 3D scene and blends
			    the canvas into the light body below. */}
			<div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#faf6f4] via-[#faf6f4]/70 to-transparent" />

			<div className="relative z-10 flex flex-col items-center px-6">
				<p
					data-fade
					className="mb-5 font-medium text-[#b85d7c] text-xs uppercase tracking-[0.4em] sm:text-sm"
				>
					Stuttgart · 1859
				</p>

				<h1 className="font-heading font-semibold text-5xl text-[#2c2630] leading-[0.95] tracking-tight sm:text-7xl md:text-8xl">
					<span className="block overflow-hidden">
						<span data-word className="inline-block">
							Corps
						</span>
					</span>
					<span className="block overflow-hidden pb-2">
						<span
							data-word
							className="inline-block bg-gradient-to-r from-[#b85d7c] via-[#d98aa6] to-[#2f86d4] bg-clip-text text-transparent"
						>
							Rhenania
						</span>
					</span>
				</h1>

				<p
					data-fade
					className="mt-6 max-w-xl text-balance text-[#6f6675] text-base leading-relaxed sm:text-lg"
				>
					Eine tolerante Gemeinschaft von Studenten und Alumni — für ein
					erfolgreiches, glückliches und einzigartiges Studium.
				</p>

				<div
					data-fade
					className="mt-9 flex flex-wrap items-center justify-center gap-4"
				>
					<Link
						href="/contact"
						className="rounded-full bg-gradient-to-r from-[#d98aa6] to-[#2f86d4] px-8 py-3 font-semibold text-sm text-white tracking-wide shadow-[0_8px_24px_-8px_rgba(47,134,212,0.6)] transition-transform duration-300 hover:scale-105"
					>
						Bewirb dich
					</Link>
					<a
						href="#leben"
						className="rounded-full border border-[#2c2630]/15 px-8 py-3 font-medium text-[#2c2630]/80 text-sm tracking-wide transition-colors hover:border-[#2f86d4] hover:text-[#2f86d4]"
					>
						Mehr erfahren
					</a>
				</div>
			</div>
		</section>
	);
}
