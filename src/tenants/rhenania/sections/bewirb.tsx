"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion, useReveal } from "../motion";

export function Bewirb({ ctaImageUrl }: { ctaImageUrl: string }) {
	const reveal = useReveal<HTMLDivElement>({ start: "top 80%" });
	const btn = useRef<HTMLAnchorElement>(null);

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
		<section className="relative flex min-h-[80svh] w-full items-center justify-center overflow-hidden px-6 py-28">
			<Image
				src={ctaImageUrl}
				alt=""
				fill
				sizes="100vw"
				className="-z-10 object-cover opacity-40"
				unoptimized={ctaImageUrl.endsWith(".gif")}
			/>
			<div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#faf6f4] via-[#faf6f4]/72 to-[#faf6f4]" />

			<div
				ref={reveal}
				className="relative z-10 flex flex-col items-center text-center"
			>
				<h2
					data-animate
					className="max-w-2xl font-heading font-semibold text-4xl text-[#2c2630] leading-tight tracking-tight sm:text-6xl"
				>
					Werde Teil von Rhenania
				</h2>
				<p
					data-animate
					className="mt-5 max-w-lg text-balance text-[#6f6675] text-lg"
				>
					Lerne uns kennen — unverbindlich und jederzeit willkommen.
				</p>
				<div data-animate className="mt-10">
					<Link
						ref={btn}
						href="/contact"
						className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#d98aa6] to-[#2f86d4] px-12 py-4 font-semibold text-lg text-white tracking-wide shadow-[0_12px_36px_-10px_rgba(47,134,212,0.6)] transition-transform duration-300 hover:scale-105"
					>
						Bewirb dich
					</Link>
				</div>
			</div>
		</section>
	);
}
