"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion } from "../motion";

const LETTERS = Array.from("Rhenania");

export function Hero({ heroImageUrl }: { heroImageUrl: string }) {
	const root = useRef<HTMLElement>(null);

	useLayoutEffect(() => {
		const el = root.current;
		if (!el || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();

		const ctx = gsap.context(() => {
			const tl = gsap.timeline({
				defaults: { ease: "expo.out" },
				delay: 0.15,
			});
			tl.from("[data-ribbon]", {
				scaleY: 0,
				transformOrigin: "top center",
				duration: 1.0,
			});
			tl.from("[data-crest]", { opacity: 0, y: 12, duration: 0.9 }, "-=0.65");
			tl.from("[data-kicker]", { opacity: 0, y: 14, duration: 0.8 }, "-=0.7");
			tl.from(
				"[data-letter]",
				{ yPercent: 120, duration: 1.1, stagger: 0.045 },
				"-=0.6",
			);
			tl.from(
				"[data-fade]",
				{ opacity: 0, y: 22, duration: 0.9, stagger: 0.14 },
				"-=0.75",
			);
			tl.from(
				"[data-frame]",
				{ clipPath: "inset(100% 0% 0% 0%)", y: 56, duration: 1.5 },
				"-=1.15",
			);
			tl.from(
				"[data-photo]",
				{ scale: 1.18, duration: 2.0, ease: "power3.out" },
				"<",
			);

			// Gentle depth on exit: the type drifts up a touch faster than the
			// scroll, the photo lags behind it.
			gsap.to("[data-content]", {
				yPercent: -14,
				ease: "none",
				scrollTrigger: {
					trigger: el,
					start: "top top",
					end: "bottom top",
					scrub: true,
				},
			});
			gsap.to("[data-frame]", {
				yPercent: -6,
				ease: "none",
				scrollTrigger: {
					trigger: el,
					start: "top top",
					end: "bottom top",
					scrub: true,
				},
			});
		}, el);

		return () => ctx.revert();
	}, []);

	return (
		<section
			ref={root}
			className="relative flex min-h-[100svh] w-full flex-col overflow-hidden"
		>
			{/* Quiet couleur atmosphere — two soft washes, no motion. */}
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div
					className="absolute -top-[22%] -left-[14%] h-[38rem] w-[38rem] rounded-full opacity-[0.15] blur-3xl"
					style={{
						background: "radial-gradient(circle, #d98aa6 0%, transparent 65%)",
					}}
				/>
				<div
					className="absolute -top-[14%] -right-[12%] h-[36rem] w-[36rem] rounded-full opacity-[0.13] blur-3xl"
					style={{
						background: "radial-gradient(circle, #2f86d4 0%, transparent 65%)",
					}}
				/>
			</div>

			{/* Couleur band dropping from the top edge — rosa · weiß · azurblau. */}
			<div
				data-ribbon
				aria-hidden
				className="absolute top-0 left-1/2 z-10 h-24 w-3 -translate-x-1/2 shadow-[0_2px_10px_rgba(44,38,48,0.15)] md:h-32"
				style={{
					background:
						"linear-gradient(to right, #d98aa6 0% 33.4%, #ffffff 33.4% 66.7%, #2f86d4 66.7% 100%)",
				}}
			/>

			<div
				data-content
				className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pt-32 pb-12 text-center md:pt-36"
			>
				{/* Zirkel crest. The SVG canvas has generous margins around the
				    monogram, so it is scaled up inside a small clipped-free box. */}
				<div data-crest className="relative mb-8 h-16 w-16">
					<Image
						src="/zirkel.svg"
						alt=""
						fill
						className="scale-[2.4] object-contain opacity-80"
					/>
				</div>

				<p
					data-kicker
					className="font-medium text-[#b85d7c] text-[11px] uppercase tracking-[0.45em] sm:text-xs"
				>
					Corps · Stuttgart · seit 1859
				</p>

				<h1 className="mt-4 font-heading text-[#2c2630] tracking-tight">
					<span className="sr-only">Corps Rhenania Stuttgart</span>
					<span
						aria-hidden
						className="block overflow-hidden px-3 pb-2 font-medium text-7xl italic leading-[1.05] sm:text-8xl md:text-[8.5rem]"
					>
						{LETTERS.map((ch, i) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: static letter list
								key={i}
								data-letter
								className="inline-block will-change-transform"
							>
								{ch}
							</span>
						))}
					</span>
				</h1>

				<p
					data-fade
					className="mt-5 max-w-xl text-balance text-[#6f6675] text-base leading-relaxed sm:text-lg"
				>
					Eine tolerante Gemeinschaft von Studenten und Alumni — für ein
					erfolgreiches, glückliches und einzigartiges Studium.
				</p>

				<div
					data-fade
					className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-4"
				>
					<Link
						href="/contact"
						className="group inline-flex items-center gap-2 rounded-full bg-[#2c2630] px-8 py-3.5 font-medium text-[#faf6f4] text-sm tracking-wide transition-colors duration-300 hover:bg-[#b85d7c]"
					>
						Bewirb dich
						<ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
					</Link>
					<a
						href="#leben"
						className="group relative py-2 font-medium text-[#2c2630]/70 text-sm tracking-wide transition-colors duration-300 hover:text-[#2c2630]"
					>
						Mehr erfahren
						<span
							aria-hidden
							className="absolute inset-x-0 bottom-1 h-px bg-[#2c2630]/25"
						/>
						<span
							aria-hidden
							className="absolute inset-x-0 bottom-1 h-px origin-left scale-x-0 bg-[#b85d7c] transition-transform duration-300 group-hover:scale-x-100"
						/>
					</a>
				</div>
			</div>

			{/* Cinematic anchor: the photo rises out of the fold. */}
			<div
				data-frame
				className="relative z-10 mx-auto w-full max-w-6xl px-4 sm:px-6"
				style={{ clipPath: "inset(0% 0% 0% 0%)" }}
			>
				<div className="relative h-[32svh] min-h-[220px] overflow-hidden rounded-t-3xl shadow-[0_-24px_70px_-32px_rgba(44,38,48,0.45)] ring-1 ring-black/5 md:h-[38svh]">
					<Image
						data-photo
						src={heroImageUrl}
						alt="Corps Rhenania"
						fill
						priority
						sizes="(max-width: 1152px) 100vw, 1152px"
						className="object-cover will-change-transform"
						unoptimized={heroImageUrl.endsWith(".gif")}
					/>
				</div>
			</div>
		</section>
	);
}
