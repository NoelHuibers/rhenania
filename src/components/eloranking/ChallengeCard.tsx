"use client";

import { AlertTriangle, Check, Clock, Swords, Trophy, X } from "lucide-react";
import Link from "next/link";
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
	if (diffMs <= 0) {
		return "abgelaufen";
	}
	const totalSec = Math.floor(diffMs / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	if (h > 0) {
		return `${h}h ${m}m`;
	}
	if (m > 0) {
		return `${m}m ${String(s).padStart(2, "0")}s`;
	}
	return `${s}s`;
}

function useCountdown(target: Date | null) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!target) {
			return;
		}
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, [target]);
	if (!target) {
		return "";
	}
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
				return "border-warning";
			case "awaiting-my-confirm":
				return "border-warning";
			case "disputed":
				return "border-danger";
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
						<Swords className="h-4 w-4 text-warning-muted-foreground" />
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
						<Trophy className="h-4 w-4 text-success" />
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
						<AlertTriangle className="h-4 w-4 text-warning-muted-foreground" />
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
						<AlertTriangle className="h-4 w-4 text-destructive" />
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
				<Link
					href={`/profile/${other.id}`}
					className="group flex min-w-0 flex-1 items-center gap-3"
				>
					<Avatar className="h-9 w-9 sm:h-10 sm:w-10">
						<AvatarImage
							src={other.avatar || undefined}
							alt={other.name || ""}
						/>
						<AvatarFallback className="text-xs">
							{(other.name || "?")
								.split(" ")
								.map((n) => n[0])
								.join("")
								.toUpperCase()
								.slice(0, 2)}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<div className="truncate font-medium text-sm group-hover:underline">
							{other.name || "Unbekannt"}
						</div>
						<div className="truncate text-muted-foreground text-xs">
							🍺 {c.drinkName} ({c.quantity}×) · 💰 {paymentText}
						</div>
					</div>
				</Link>
			</div>

			{variant === "awaiting-my-confirm" ? (
				<div className="mb-3 rounded bg-muted/50 p-2 text-muted-foreground text-xs">
					Wenn du nichts tust, wird das Ergebnis nach Ablauf automatisch
					bestätigt.
				</div>
			) : null}

			{variant === "disputed" ? (
				<div className="rounded bg-danger-muted p-2 text-danger-muted-foreground text-xs">
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
						className="flex-1 bg-warning text-warning-foreground hover:bg-warning/90"
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
							className="flex-1 bg-success text-success-foreground hover:bg-success/90"
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
						className="flex-1 border-danger/40 text-danger-muted-foreground hover:bg-danger-muted"
						disabled={isPending}
						onClick={() => run(() => disputeResult(c.id))}
					>
						Anfechten
					</Button>
					<Button
						className="flex-1 bg-success text-success-foreground hover:bg-success/90"
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
