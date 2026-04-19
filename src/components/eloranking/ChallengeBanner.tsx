"use client";

import { ChevronRight, Swords } from "lucide-react";
import Link from "next/link";
import { useChallengeBadge } from "./ChallengeBadgeProvider";

export function ChallengeBanner() {
	const { feed, notificationsEnabled } = useChallengeBadge();

	if (!notificationsEnabled) return null;

	const incoming = feed.incomingPending.length;
	const awaitingConfirm = feed.awaitingMyConfirm.length;
	const total = incoming + awaitingConfirm;
	if (total === 0) return null;

	const message = (() => {
		if (incoming > 0 && awaitingConfirm > 0) {
			return `${incoming} Herausforderung${incoming > 1 ? "en" : ""} · ${awaitingConfirm} Bestätigung${awaitingConfirm > 1 ? "en" : ""} offen`;
		}
		if (incoming > 0) {
			return incoming === 1
				? "Du wurdest herausgefordert"
				: `${incoming} offene Herausforderungen`;
		}
		return awaitingConfirm === 1
			? "Ergebnis bestätigen"
			: `${awaitingConfirm} Ergebnisse bestätigen`;
	})();

	return (
		<Link
			href="/eloranking/challenges"
			className="flex items-center gap-3 rounded-lg border-2 border-orange-400 bg-orange-50 p-3 transition-colors hover:bg-orange-100 dark:bg-orange-950/20 dark:hover:bg-orange-950/40"
		>
			<Swords className="h-5 w-5 flex-shrink-0 text-orange-500" />
			<div className="flex-1 font-medium text-orange-900 text-sm dark:text-orange-100">
				{message}
			</div>
			<ChevronRight className="h-4 w-4 text-orange-500" />
		</Link>
	);
}
