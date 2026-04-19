"use client";

import { AlertTriangle, Check, Clock, Swords, Trophy, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	type ChallengeView,
	cancelChallenge,
	confirmResult,
	disputeResult,
	proposeResult,
	respondToChallenge,
} from "~/server/actions/game/challenge";
import { useChallengeBadge } from "./ChallengeBadgeProvider";

type Variant =
	| "incoming-pending"
	| "outgoing-pending"
	| "awaiting-my-result"
	| "awaiting-my-confirm"
	| "awaiting-their-confirm"
	| "disputed"
	| "history";

interface ChallengeCardProps {
	challenge: ChallengeView;
	currentUserId: string;
	variant: Variant;
}

function paymentLabel(
	payment: ChallengeView["payment"],
	challengerName: string | null,
	currentUserId: string,
	challengerId: string,
): string {
	const iAmChallenger = currentUserId === challengerId;
	const youOrName = (name: string | null) => name || "Gegner";
	switch (payment) {
		case "challenger":
			return iAmChallenger ? "Du zahlst" : `${youOrName(challengerName)} zahlt`;
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

export function ChallengeCard({
	challenge: c,
	currentUserId,
	variant,
}: ChallengeCardProps) {
	const { refresh } = useChallengeBadge();
	const [isPending, startTransition] = useTransition();

	const iAmChallenger = currentUserId === c.challengerId;
	const other = iAmChallenger
		? {
				id: c.opponentId,
				name: c.opponentName,
				avatar: c.opponentAvatar,
			}
		: {
				id: c.challengerId,
				name: c.challengerName,
				avatar: c.challengerAvatar,
			};

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

	const paymentText = paymentLabel(
		c.payment,
		c.challengerName,
		currentUserId,
		c.challengerId,
	);

	const run = (fn: () => Promise<{ success: boolean; error?: string }>) => {
		startTransition(async () => {
			const res = await fn();
			if (res.success) {
				await refresh();
			} else {
				toast.error(res.error || "Fehler");
			}
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
						<Swords className="h-4 w-4 text-orange-500" />
						<span>Du wurdest herausgefordert</span>
					</>
				);
			case "outgoing-pending":
				return (
					<>
						<Clock className="h-4 w-4" />
						<span>Warten auf {other.name || "Gegner"}</span>
					</>
				);
			case "awaiting-my-result":
				return (
					<>
						<Trophy className="h-4 w-4 text-green-600" />
						<span>Spiel läuft — {other.name || "Gegner"}</span>
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
						<AlertTriangle className="h-4 w-4 text-yellow-600" />
						<span>
							{theyWon
								? `${proposedWinnerName || "Gegner"} behauptet zu gewinnen`
								: `${other.name || "Gegner"} bestätigt deinen Sieg?`}
						</span>
					</>
				);
			}
			case "awaiting-their-confirm":
				return (
					<>
						<Clock className="h-4 w-4" />
						<span>Warten auf Bestätigung</span>
					</>
				);
			case "disputed":
				return (
					<>
						<AlertTriangle className="h-4 w-4 text-red-600" />
						<span>Anfechtung</span>
					</>
				);
			case "history":
				return (
					<>
						<Clock className="h-4 w-4" />
						<span className="capitalize">{c.status}</span>
					</>
				);
		}
	})();

	return (
		<div className={`rounded-lg border-2 bg-card p-4 ${accent}`}>
			<div className="mb-3 flex items-center gap-2 font-medium text-sm">
				{header}
				{countdown && variant !== "history" ? (
					<Badge variant="secondary" className="ml-auto">
						⏱ {countdown}
					</Badge>
				) : null}
			</div>

			<div className="mb-3 flex items-center gap-3">
				<Avatar className="h-10 w-10">
					<AvatarImage src={other.avatar || undefined} alt={other.name || ""} />
					<AvatarFallback>
						{(other.name || "?")
							.split(" ")
							.map((n) => n[0])
							.join("")
							.toUpperCase()
							.slice(0, 2)}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<div className="truncate font-medium text-sm">
						{other.name || "Unbekannt"}
					</div>
					<div className="text-muted-foreground text-xs">
						🍺 {c.drinkName} ({c.quantity}×) · 💰 {paymentText}
					</div>
				</div>
			</div>

			{variant === "awaiting-my-confirm" ? (
				<div className="mb-3 rounded bg-muted/50 p-2 text-muted-foreground text-xs">
					Wenn du nichts tust, wird das Ergebnis nach Ablauf automatisch
					bestätigt.
				</div>
			) : null}

			{variant === "disputed" ? (
				<div className="rounded bg-red-50 p-2 text-red-700 text-xs dark:bg-red-950/20 dark:text-red-300">
					Anfechtung — bitte persönlich klären.
				</div>
			) : null}

			{/* Actions */}
			{variant === "incoming-pending" ? (
				<div className="flex gap-2">
					<Button
						variant="outline"
						className="flex-1"
						disabled={isPending}
						onClick={() =>
							run(() =>
								respondToChallenge({
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
								respondToChallenge({
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
					onClick={() => run(() => cancelChallenge(c.id))}
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
									proposeResult({
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
									proposeResult({
										challengeId: c.id,
										winnerId: other.id,
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
						onClick={() => run(() => cancelChallenge(c.id))}
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
						onClick={() => run(() => disputeResult(c.id))}
					>
						Anfechten
					</Button>
					<Button
						className="flex-1 bg-green-500 hover:bg-green-600"
						disabled={isPending}
						onClick={() => run(() => confirmResult(c.id))}
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
					onClick={() => run(() => cancelChallenge(c.id))}
				>
					Abbrechen
				</Button>
			) : null}
		</div>
	);
}
