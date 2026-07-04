"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion, useReveal } from "../motion";

export function Bewirb({ ctaImageUrl }: { ctaImageUrl: string }) {
	const reveal = useReveal<HTMLDivElement>({ start: "top 80%" });
	const section = useRef<HTMLElement>(null);
	const btn = useRef<HTMLAnchorElement>(null);

	// Drifting aurora + periodic button shine.
	useLayoutEffect(() => {
		const el = section.current;
		if (!el || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();
		const ctx = gsap.context(() => {
			el.querySelectorAll<HTMLElement>("[data-aurora]").forEach((blob, i) => {
				gsap.to(blob, {
					xPercent: i % 2 === 0 ? 18 : -18,
					yPercent: i % 2 === 0 ? -12 : 14,
					scale: 1.15,
					duration: 9 + i * 2,
					repeat: -1,
					yoyo: true,
					ease: "sine.inOut",
				});
			});
			gsap.fromTo(
				"[data-shine]",
				{ xPercent: -160 },
				{
					xPercent: 260,
					duration: 1.4,
					ease: "power2.inOut",
					repeat: -1,
					repeatDelay: 2.6,
				},
			);
		}, el);
		return () => ctx.revert();
	}, []);

	// Magnetic button: ease the button toward the pointer while hovered.
	useLayoutEffect(() => {
		const el = btn.current;
		if (!el || prefersReducedMotion()) return;
		const { gsap } = ensureGsap();
		const xTo = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
		const yTo = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });

		const onMove = (e: PointerEvent) => {
			const r = el.getBoundingClientRect();
			xTo((e.clientX - (r.left + r.width / 2)) * 0.4);
			yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
		};
		const onLeave = () => {
			xTo(0);
			yTo(0);
		};
		el.addEventListener("pointermove", onMove);
		el.addEventListener("pointerleave", onLeave);
		return () => {
			el.removeEventListener("pointermove", onMove);
			el.removeEventListener("pointerleave", onLeave);
		};
	}, []);

	return (
		<section
			ref={section}
			className="relative flex min-h-[88svh] w-full items-center justify-center overflow-hidden px-6 py-28"
		>
			{/* Photo base */}
			<Image
				src={ctaImageUrl}
				alt=""
				fill
				sizes="100vw"
				className="-z-30 object-cover opacity-35"
				unoptimized={ctaImageUrl.endsWith(".gif")}
			/>
			<div className="absolute inset-0 -z-20 bg-gradient-to-b from-[#faf6f4] via-[#faf6f4]/78 to-[#faf6f4]" />

			{/* Drifting Couleur aurora */}
			<div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
				<div
					data-aurora
					className="absolute top-[-10%] left-[-5%] h-[42rem] w-[42rem] rounded-full opacity-55 blur-3xl"
					style={{
						background:
							"radial-gradient(circle at 50% 50%, #d98aa6 0%, rgba(217,138,166,0) 68%)",
					}}
				/>
				<div
					data-aurora
					className="absolute right-[-8%] bottom-[-15%] h-[44rem] w-[44rem] rounded-full opacity-55 blur-3xl"
					style={{
						background:
							"radial-gradient(circle at 50% 50%, #2f86d4 0%, rgba(47,134,212,0) 68%)",
					}}
				/>
				<div
					data-aurora
					className="absolute top-[20%] left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
					style={{
						background:
							"radial-gradient(circle at 50% 50%, #ffffff 0%, rgba(255,255,255,0) 70%)",
					}}
				/>
			</div>

			{/* Faint Zirkel watermark */}
			<Image
				src="/zirkel.svg"
				alt=""
				aria-hidden
				width={520}
				height={520}
				className="pointer-events-none absolute top-1/2 left-1/2 -z-10 h-auto w-[34rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 opacity-[0.04]"
			/>

			<div
				ref={reveal}
				className="relative z-10 flex flex-col items-center text-center"
			>
				<p
					data-animate
					className="mb-5 font-medium text-[#b85d7c] text-xs uppercase tracking-[0.45em]"
				>
					Jederzeit willkommen
				</p>
				<h2
					data-animate
					className="max-w-3xl font-heading font-semibold text-5xl text-[#2c2630] leading-[1.02] tracking-tight sm:text-7xl"
				>
					Werde Teil von <span className="text-[#b85d7c] italic">Rhenania</span>
				</h2>
				<p
					data-animate
					className="mt-6 max-w-lg text-balance text-[#6f6675] text-lg"
				>
					Lerne uns kennen — unverbindlich und jederzeit willkommen.
				</p>
				<div data-animate className="mt-11">
					<Link
						ref={btn}
						href="/contact"
						className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-[#2c2630] px-12 py-4 font-medium text-[#faf6f4] text-lg tracking-wide shadow-[0_16px_44px_-12px_rgba(44,38,48,0.55)] transition-colors duration-300 hover:bg-[#b85d7c]"
					>
						<span
							data-shine
							aria-hidden
							className="pointer-events-none absolute inset-y-0 left-0 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/55 to-transparent"
						/>
						<span className="relative">Bewirb dich</span>
						<ArrowRight className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
					</Link>
				</div>
			</div>
		</section>
	);
}
