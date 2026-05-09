"use client";

import {
	AlertTriangle,
	Check,
	Clock,
	Globe,
	Swords,
	Trophy,
	X,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	type CrossChallengeView,
	cancelCrossTenantChallenge,
	confirmCrossTenantResult,
	disputeCrossTenantResult,
	proposeCrossTenantResult,
	respondToCrossTenantChallenge,
} from "~/server/actions/game/cross-tenant-challenge";

type Variant =
	| "incoming-pending"
	| "outgoing-pending"
	| "awaiting-my-result"
	| "awaiting-my-confirm"
	| "awaiting-their-confirm"
	| "disputed"
	| "history";

interface CrossChallengeCardProps {
	challenge: CrossChallengeView;
	currentUserId: string;
	variant: Variant;
	onChanged: () => void;
}

function paymentLabel(payment: CrossChallengeView["payment"]): string {
	switch (payment) {
		case "none":
			return "Offline geklärt";
		case "challenger":
			return "Herausforderer zahlt";
		case "loser":
			return "Verlierer zahlt";
		case "split":
			return "50 / 50";
	}
}

function formatDelta(target: Date, now: number): string {
	const diffMs = target.getTime() - now;
	if (diffMs <= 0) return "abgelaufen";
	const totalSec = Math.floor(diffMs / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
	return `${s}s`;
}

function useCountdown(target: Date | null) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!target) return;
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [target]);
	if (!target) return "";
	return formatDelta(target, now);
}

function initials(name: string | null): string {
	if (!name) return "?";
	return name
		.split(/[\s.@]/)
		.filter(Boolean)
		.map((p) => p[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function CrossChallengeCard({
	challenge: c,
	currentUserId,
	variant,
	onChanged,
}: CrossChallengeCardProps) {
	const [isPending, startTransition] = useTransition();

	const iAmChallenger = currentUserId === c.challengerId;
	const otherName = iAmChallenger ? c.opponentName : c.challengerName;
	const otherCorps = iAmChallenger
		? c.opponentTenantName
		: c.challengerTenantName;
	const otherCorpsSlug = iAmChallenger
		? c.opponentTenantSlug
		: c.challengerTenantSlug;
	const otherId = iAmChallenger ? c.opponentId : c.challengerId;

	const deadline =
		variant === "incoming-pending" || variant === "outgoing-pending"
			? c.respondDeadline
			: variant === "awaiting-my-result"
				? c.playDeadline
				: variant === "awaiting-my-confirm" ||
						variant === "awaiting-their-confirm"
					? c.confirmDeadline
					: null;
	const countdown = useCountdown(deadline);

	const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
		startTransition(async () => {
			const res = await fn();
			if (res.success) onChanged();
			else toast.error(res.error || "Fehler");
		});
	};

	const accent = (() => {
		switch (variant) {
			case "incoming-pending":
				return "border-orange-400";
			case "awaiting-my-confirm":
				return "border-yellow-400";
			case "disputed":
				return "border-red-400";
			case "history":
				return "border-border opacity-80";
			default:
				return "border-border";
		}
	})();

	const header = (() => {
		switch (variant) {
			case "incoming-pending":
				return (
					<>
						<Swords className="h-4 w-4 shrink-0 text-orange-500" />
						<span className="truncate">Du wurdest herausgefordert</span>
					</>
				);
			case "outgoing-pending":
				return (
					<>
						<Clock className="h-4 w-4 shrink-0" />
						<span className="truncate">Warten auf {otherName ?? "Gegner"}</span>
					</>
				);
			case "awaiting-my-result":
				return (
					<>
						<Trophy className="h-4 w-4 shrink-0 text-green-600" />
						<span className="truncate">
							Spiel läuft — {otherName ?? "Gegner"}
						</span>
					</>
				);
			case "awaiting-my-confirm": {
				const proposedWinnerName =
					c.proposedWinnerId === c.challengerId
						? c.challengerName
						: c.opponentName;
				const theyWon = c.proposedWinnerId !== currentUserId;
				return (
					<>
						<AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
						<span className="truncate">
							{theyWon
								? `${proposedWinnerName ?? "Gegner"} behauptet zu gewinnen`
								: `${otherName ?? "Gegner"} bestätigt deinen Sieg?`}
						</span>
					</>
				);
			}
			case "awaiting-their-confirm":
				return (
					<>
						<Clock className="h-4 w-4 shrink-0" />
						<span className="truncate">Warten auf Bestätigung</span>
					</>
				);
			case "disputed":
				return (
					<>
						<AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
						<span className="truncate">Anfechtung</span>
					</>
				);
			case "history":
				return (
					<>
						<Clock className="h-4 w-4 shrink-0" />
						<span className="truncate capitalize">{c.status}</span>
					</>
				);
		}
	})();

	return (
		<div className={`rounded-lg border-2 bg-card p-3 sm:p-4 ${accent}`}>
			<div className="mb-2 flex items-center gap-2 font-medium text-sm">
				{header}
				{countdown && variant !== "history" ? (
					<Badge variant="secondary" className="ml-auto shrink-0">
						⏱ {countdown}
					</Badge>
				) : null}
			</div>

			<div className="mb-3 flex items-center gap-3">
				<Avatar className="h-9 w-9 sm:h-10 sm:w-10">
					<AvatarFallback className="text-xs">
						{initials(otherName)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-1.5 text-sm">
						<span className="truncate font-medium">
							{otherName ?? "Unbekannt"}
						</span>
						<Badge
							variant="outline"
							className="shrink-0 gap-1 font-mono text-[10px]"
						>
							<Globe className="h-2.5 w-2.5" />
							{otherCorpsSlug || otherCorps}
						</Badge>
					</div>
					<div className="text-muted-foreground text-xs">
						{c.drinkName ? `🍺 ${c.drinkName} (${c.quantity}×) · ` : ""}💰{" "}
						{paymentLabel(c.payment)}
					</div>
				</div>
			</div>

			{variant === "awaiting-my-confirm" ? (
				<div className="mb-3 rounded bg-muted/50 p-2 text-muted-foreground text-xs">
					Wenn du nichts tust, läuft die Bestätigungsfrist ab.
				</div>
			) : null}

			{variant === "disputed" ? (
				<div className="rounded bg-red-50 p-2 text-red-700 text-xs dark:bg-red-950/20 dark:text-red-300">
					Anfechtung — bitte mit dem Gegner persönlich klären.
				</div>
			) : null}

			{variant === "incoming-pending" ? (
				<div className="flex gap-2">
					<Button
						variant="outline"
						className="flex-1"
						disabled={isPending}
						onClick={() =>
							run(() =>
								respondToCrossTenantChallenge({
									challengeId: c.id,
									response: "decline",
								}),
							)
						}
					>
						<X className="mr-1 h-4 w-4" /> Ablehnen
					</Button>
					<Button
						className="flex-1 bg-orange-500 hover:bg-orange-600"
						disabled={isPending}
						onClick={() =>
							run(() =>
								respondToCrossTenantChallenge({
									challengeId: c.id,
									response: "accept",
								}),
							)
						}
					>
						<Check className="mr-1 h-4 w-4" /> Annehmen
					</Button>
				</div>
			) : null}

			{variant === "outgoing-pending" ? (
				<Button
					variant="outline"
					className="w-full"
					disabled={isPending}
					onClick={() => run(() => cancelCrossTenantChallenge(c.id))}
				>
					Zurückziehen
				</Button>
			) : null}

			{variant === "awaiting-my-result" ? (
				<div className="space-y-2">
					<div className="flex gap-2">
						<Button
							className="flex-1 bg-green-500 hover:bg-green-600"
							disabled={isPending}
							onClick={() =>
								run(() =>
									proposeCrossTenantResult({
										challengeId: c.id,
										winnerId: currentUserId,
									}),
								)
							}
						>
							<Trophy className="mr-1 h-4 w-4" /> Ich hab gewonnen
						</Button>
						<Button
							variant="outline"
							className="flex-1"
							disabled={isPending}
							onClick={() =>
								run(() =>
									proposeCrossTenantResult({
										challengeId: c.id,
										winnerId: otherId,
									}),
								)
							}
						>
							Ich hab verloren
						</Button>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="w-full text-muted-foreground text-xs"
						disabled={isPending}
						onClick={() => run(() => cancelCrossTenantChallenge(c.id))}
					>
						Abbrechen
					</Button>
				</div>
			) : null}

			{variant === "awaiting-my-confirm" ? (
				<div className="flex gap-2">
					<Button
						variant="outline"
						className="flex-1 border-red-300 text-red-700 hover:bg-red-50"
						disabled={isPending}
						onClick={() => run(() => disputeCrossTenantResult(c.id))}
					>
						Anfechten
					</Button>
					<Button
						className="flex-1 bg-green-500 hover:bg-green-600"
						disabled={isPending}
						onClick={() => run(() => confirmCrossTenantResult(c.id))}
					>
						<Check className="mr-1 h-4 w-4" /> Bestätigen
					</Button>
				</div>
			) : null}

			{variant === "awaiting-their-confirm" ? (
				<Button
					variant="ghost"
					size="sm"
					className="w-full text-muted-foreground text-xs"
					disabled={isPending}
					onClick={() => run(() => cancelCrossTenantChallenge(c.id))}
				>
					Abbrechen
				</Button>
			) : null}
		</div>
	);
}
