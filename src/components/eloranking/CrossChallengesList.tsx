"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	type CrossChallengeFeed,
	type CrossChallengeView,
	cancelCrossTenantChallenge,
	confirmCrossTenantResult,
	disputeCrossTenantResult,
	proposeCrossTenantResult,
	respondToCrossTenantChallenge,
} from "~/server/actions/game/cross-tenant-challenge";

type Props = {
	feed: CrossChallengeFeed;
	onChanged: () => void;
};

export function CrossChallengesList({ feed, onChanged }: Props) {
	const allEmpty =
		feed.incomingPending.length === 0 &&
		feed.outgoingPending.length === 0 &&
		feed.awaitingMyResult.length === 0 &&
		feed.awaitingMyConfirm.length === 0 &&
		feed.disputed.length === 0;

	if (allEmpty && feed.history.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Cross-Corps-Herausforderungen</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="py-4 text-center text-muted-foreground text-sm">
						Du hast noch keine Cross-Corps-Herausforderungen.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{feed.incomingPending.length > 0 && (
				<Section title="Eingehend">
					{feed.incomingPending.map((c) => (
						<IncomingPendingRow key={c.id} c={c} onChanged={onChanged} />
					))}
				</Section>
			)}
			{feed.awaitingMyConfirm.length > 0 && (
				<Section title="Ergebnis bestätigen">
					{feed.awaitingMyConfirm.map((c) => (
						<AwaitingConfirmRow key={c.id} c={c} onChanged={onChanged} />
					))}
				</Section>
			)}
			{feed.awaitingMyResult.length > 0 && (
				<Section title="Ergebnis melden">
					{feed.awaitingMyResult.map((c) => (
						<AwaitingResultRow key={c.id} c={c} onChanged={onChanged} />
					))}
				</Section>
			)}
			{feed.outgoingPending.length > 0 && (
				<Section title="Ausgehend">
					{feed.outgoingPending.map((c) => (
						<OutgoingPendingRow key={c.id} c={c} onChanged={onChanged} />
					))}
				</Section>
			)}
			{feed.active.length > 0 && (
				<Section title="Auf Bestätigung warten">
					{feed.active.map((c) => (
						<RowSummary key={c.id} c={c} extra="Wartet auf Gegner" />
					))}
				</Section>
			)}
			{feed.disputed.length > 0 && (
				<Section title="Bestritten">
					{feed.disputed.map((c) => (
						<RowSummary key={c.id} c={c} extra="Manuelle Klärung nötig" />
					))}
				</Section>
			)}
			{feed.history.length > 0 && (
				<Section title="Verlauf">
					{feed.history.slice(0, 10).map((c) => (
						<RowSummary key={c.id} c={c} extra={c.status} />
					))}
				</Section>
			)}
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">{children}</CardContent>
		</Card>
	);
}

function describePlayer(
	c: CrossChallengeView,
	role: "challenger" | "opponent",
) {
	if (role === "challenger") {
		return `${c.challengerName ?? "Spieler"} (${c.challengerTenantName})`;
	}
	return `${c.opponentName ?? "Spieler"} (${c.opponentTenantName})`;
}

function RowSummary({
	c,
	extra,
	children,
}: {
	c: CrossChallengeView;
	extra?: string;
	children?: React.ReactNode;
}) {
	const me = c.role;
	const them: "challenger" | "opponent" =
		me === "challenger" ? "opponent" : "challenger";
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
			<div className="space-y-1">
				<div className="font-medium">vs. {describePlayer(c, them)}</div>
				<div className="flex gap-2 text-muted-foreground text-xs">
					<Badge variant="secondary">{c.payment}</Badge>
					{c.drinkName && (
						<span>
							{c.quantity}× {c.drinkName}
						</span>
					)}
					{extra && <span>· {extra}</span>}
				</div>
			</div>
			{children && <div className="flex gap-2">{children}</div>}
		</div>
	);
}

function IncomingPendingRow({
	c,
	onChanged,
}: {
	c: CrossChallengeView;
	onChanged: () => void;
}) {
	const [isPending, startTransition] = useTransition();
	const respond = (response: "accept" | "decline") => {
		startTransition(async () => {
			const r = await respondToCrossTenantChallenge({
				challengeId: c.id,
				response,
			});
			if (r.success) {
				toast.success(response === "accept" ? "Angenommen" : "Abgelehnt");
				onChanged();
			} else {
				toast.error(r.error ?? "Fehler");
			}
		});
	};
	return (
		<RowSummary c={c}>
			<Button
				size="sm"
				variant="outline"
				onClick={() => respond("decline")}
				disabled={isPending}
			>
				Ablehnen
			</Button>
			<Button size="sm" onClick={() => respond("accept")} disabled={isPending}>
				Annehmen
			</Button>
		</RowSummary>
	);
}

function OutgoingPendingRow({
	c,
	onChanged,
}: {
	c: CrossChallengeView;
	onChanged: () => void;
}) {
	const [isPending, startTransition] = useTransition();
	const cancel = () => {
		if (!confirm("Herausforderung zurückziehen?")) return;
		startTransition(async () => {
			const r = await cancelCrossTenantChallenge(c.id);
			if (r.success) {
				toast.success("Zurückgezogen");
				onChanged();
			} else {
				toast.error(r.error ?? "Fehler");
			}
		});
	};
	return (
		<RowSummary c={c} extra="Wartet auf Antwort">
			<Button size="sm" variant="outline" onClick={cancel} disabled={isPending}>
				Zurückziehen
			</Button>
		</RowSummary>
	);
}

function AwaitingResultRow({
	c,
	onChanged,
}: {
	c: CrossChallengeView;
	onChanged: () => void;
}) {
	const [isPending, startTransition] = useTransition();
	const propose = (winnerId: string) => {
		startTransition(async () => {
			const r = await proposeCrossTenantResult({ challengeId: c.id, winnerId });
			if (r.success) {
				toast.success("Ergebnis vorgeschlagen — wartet auf Bestätigung");
				onChanged();
			} else {
				toast.error(r.error ?? "Fehler");
			}
		});
	};
	return (
		<RowSummary c={c}>
			<Button
				size="sm"
				variant="outline"
				onClick={() => propose(c.challengerId)}
				disabled={isPending}
			>
				{c.challengerName ?? "Herausforderer"} hat gewonnen
			</Button>
			<Button
				size="sm"
				onClick={() => propose(c.opponentId)}
				disabled={isPending}
			>
				{c.opponentName ?? "Gegner"} hat gewonnen
			</Button>
		</RowSummary>
	);
}

function AwaitingConfirmRow({
	c,
	onChanged,
}: {
	c: CrossChallengeView;
	onChanged: () => void;
}) {
	const [isPending, startTransition] = useTransition();
	const winnerLabel =
		c.proposedWinnerId === c.challengerId
			? (c.challengerName ?? "Herausforderer")
			: (c.opponentName ?? "Gegner");

	const confirm = () => {
		startTransition(async () => {
			const r = await confirmCrossTenantResult(c.id);
			if (r.success) {
				toast.success("Spiel bestätigt — ELO aktualisiert");
				onChanged();
			} else {
				toast.error(r.error ?? "Fehler");
			}
		});
	};
	const dispute = () => {
		startTransition(async () => {
			const r = await disputeCrossTenantResult(c.id);
			if (r.success) {
				toast.success("Bestritten — manuelle Klärung");
				onChanged();
			} else {
				toast.error(r.error ?? "Fehler");
			}
		});
	};

	return (
		<RowSummary c={c} extra={`Vorgeschlagen: ${winnerLabel} hat gewonnen`}>
			<Button
				size="sm"
				variant="outline"
				onClick={dispute}
				disabled={isPending}
			>
				Bestreiten
			</Button>
			<Button size="sm" onClick={confirm} disabled={isPending}>
				Bestätigen
			</Button>
		</RowSummary>
	);
}
