"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FaWikipediaW } from "react-icons/fa6";
import { IoLogoInstagram, IoMailOutline } from "react-icons/io5";
import { cn } from "~/lib/utils";

const SOCIAL = [
	{
		href: "https://www.instagram.com/corps.rhenania/",
		label: "Instagram",
		Icon: IoLogoInstagram,
		external: true,
	},
	{
		href: "https://de.wikipedia.org/wiki/Corps_Rhenania_Stuttgart",
		label: "Wikipedia",
		Icon: FaWikipediaW,
		external: true,
	},
	{
		href: "mailto:corps@rhenania-stuttgart.de",
		label: "E-Mail",
		Icon: IoMailOutline,
		external: false,
	},
] as const;

export function SiteHeader({ displayName }: { displayName: string }) {
	const [solid, setSolid] = useState(false);

	useEffect(() => {
		const onScroll = () => setSolid(window.scrollY > 48);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className={cn(
				"fixed top-0 z-50 flex w-full items-center justify-between px-4 py-3 text-[#2c2630] transition-all duration-500 md:px-8",
				solid
					? "border-black/5 border-b bg-[#faf6f4]/85 backdrop-blur-md"
					: "bg-transparent",
			)}
		>
			<Link
				href="/"
				className="font-heading font-semibold text-lg uppercase tracking-[0.2em] transition-colors hover:text-[#b85d7c]"
			>
				{displayName}
			</Link>
			<nav className="flex items-center gap-4">
				{SOCIAL.map(({ href, label, Icon, external }) => (
					<Link
						key={label}
						href={href}
						aria-label={label}
						className="text-[#2c2630]/70 transition-colors hover:text-[#b85d7c]"
						{...(external
							? { target: "_blank", rel: "noopener noreferrer" }
							: {})}
					>
						<Icon className="h-5 w-5" />
					</Link>
				))}
				{/* Members' entrance — /profile bounces logged-out visitors to the
				    sign-in page and logged-in members straight into the app. */}
				<Link
					href="/profile"
					prefetch={false}
					className="rounded-full bg-[#2c2630] px-4 py-1.5 font-medium text-[#faf6f4] text-xs tracking-wide transition-colors duration-300 hover:bg-[#b85d7c] sm:px-5 sm:py-2 sm:text-sm"
				>
					Intranet
				</Link>
			</nav>
		</header>
	);
}
