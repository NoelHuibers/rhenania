"use client";

import { Swords } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
	type CrossChallengeFeed,
	getMyCrossTenantChallenges,
} from "~/server/actions/game/cross-tenant-challenge";
import { useChallengeBadge } from "./ChallengeBadgeProvider";
import { ChallengeCard } from "./ChallengeCard";
import { CreateChallengeForm } from "./CreateChallengeForm";
import { CrossChallengeCard } from "./CrossChallengeCard";
import { CrossChallengeDialog } from "./CrossChallengeDialog";

interface ChallengesClientProps {
	currentUserId: string;
}

const EMPTY_CROSS_FEED: CrossChallengeFeed = {
	incomingPending: [],
	outgoingPending: [],
	active: [],
	awaitingMyResult: [],
	awaitingMyConfirm: [],
	disputed: [],
	history: [],
};

export function ChallengesClient({ currentUserId }: ChallengesClientProps) {
	const { feed, refresh } = useChallengeBadge();
	const [crossFeed, setCrossFeed] =
		useState<CrossChallengeFeed>(EMPTY_CROSS_FEED);
	const [internOpen, setInternOpen] = useState(false);

	const refreshCross = () => {
		getMyCrossTenantChallenges().then(setCrossFeed);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only
	useEffect(() => {
		refreshCross();
	}, []);

	const refreshAll = () => {
		refresh();
		refreshCross();
	};

	const incomingCount =
		feed.incomingPending.length + crossFeed.incomingPending.length;
	const activeCount =
		feed.active.length +
		feed.outgoingPending.length +
		crossFeed.active.length +
		crossFeed.outgoingPending.length +
		crossFeed.awaitingMyResult.length +
		crossFeed.awaitingMyConfirm.length;

	const defaultTab =
		incomingCount > 0 ? "incoming" : activeCount > 0 ? "active" : "history";

	return (
		<div className="space-y-4">
			{/* Top CTAs — stack on mobile, side-by-side on tablet+ */}
			<div className="flex flex-col gap-2 sm:flex-row">
				<Button
					className="flex-1 bg-orange-500 hover:bg-orange-600"
					onClick={() => setInternOpen(true)}
				>
					<Swords className="mr-2 h-4 w-4" />
					Intern fordern
				</Button>
				<CrossChallengeDialog />
			</div>

			<Dialog open={internOpen} onOpenChange={setInternOpen}>
				<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-140">
					<DialogHeader>
						<DialogTitle>Neue Herausforderung</DialogTitle>
					</DialogHeader>
					<CreateChallengeForm
						onCreated={() => {
							refresh();
							setInternOpen(false);
						}}
					/>
				</DialogContent>
			</Dialog>

			<Tabs defaultValue={defaultTab}>
				<TabsList className="grid w-full grid-cols-3">
					<TabsTrigger value="incoming">
						Eingehend{incomingCount > 0 ? ` (${incomingCount})` : ""}
					</TabsTrigger>
					<TabsTrigger value="active">
						Aktiv{activeCount > 0 ? ` (${activeCount})` : ""}
					</TabsTrigger>
					<TabsTrigger value="history">Verlauf</TabsTrigger>
				</TabsList>

				<TabsContent value="incoming" className="space-y-3">
					{feed.incomingPending.length === 0 &&
					crossFeed.incomingPending.length === 0 ? (
						<Empty>Keine eingehenden Herausforderungen</Empty>
					) : (
						<>
							{feed.incomingPending.map((c) => (
								<ChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="incoming-pending"
								/>
							))}
							{crossFeed.incomingPending.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="incoming-pending"
									onChanged={refreshAll}
								/>
							))}
						</>
					)}
				</TabsContent>

				<TabsContent value="active" className="space-y-3">
					{activeCount === 0 ? (
						<Empty>Keine aktiven Spiele</Empty>
					) : (
						<>
							{feed.active.map((c) => {
								let variant:
									| "awaiting-my-confirm"
									| "awaiting-their-confirm"
									| "awaiting-my-result"
									| "disputed";
								if (c.status === "disputed") {
									variant = "disputed";
								} else if (c.status === "result_proposed") {
									variant =
										c.proposedById === currentUserId
											? "awaiting-their-confirm"
											: "awaiting-my-confirm";
								} else {
									variant = "awaiting-my-result";
								}
								return (
									<ChallengeCard
										key={c.id}
										challenge={c}
										currentUserId={currentUserId}
										variant={variant}
									/>
								);
							})}
							{feed.outgoingPending.map((c) => (
								<ChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="outgoing-pending"
								/>
							))}
							{crossFeed.awaitingMyResult.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="awaiting-my-result"
									onChanged={refreshAll}
								/>
							))}
							{crossFeed.awaitingMyConfirm.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="awaiting-my-confirm"
									onChanged={refreshAll}
								/>
							))}
							{crossFeed.active.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="awaiting-their-confirm"
									onChanged={refreshAll}
								/>
							))}
							{crossFeed.disputed.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="disputed"
									onChanged={refreshAll}
								/>
							))}
							{crossFeed.outgoingPending.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="outgoing-pending"
									onChanged={refreshAll}
								/>
							))}
						</>
					)}
				</TabsContent>

				<TabsContent value="history" className="space-y-3">
					{feed.history.length === 0 && crossFeed.history.length === 0 ? (
						<Empty>Noch kein Verlauf</Empty>
					) : (
						<>
							{feed.history.map((c) => (
								<ChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="history"
								/>
							))}
							{crossFeed.history.map((c) => (
								<CrossChallengeCard
									key={c.id}
									challenge={c}
									currentUserId={currentUserId}
									variant="history"
									onChanged={refreshAll}
								/>
							))}
						</>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}

function Empty({ children }: { children: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
			{children}
		</div>
	);
}
