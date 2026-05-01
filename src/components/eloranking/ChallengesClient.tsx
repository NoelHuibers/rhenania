"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useChallengeBadge } from "./ChallengeBadgeProvider";
import { ChallengeCard } from "./ChallengeCard";
import { CreateChallengeForm } from "./CreateChallengeForm";

interface ChallengesClientProps {
	currentUserId: string;
}

export function ChallengesClient({ currentUserId }: ChallengesClientProps) {
	const { feed, refresh } = useChallengeBadge();

	const incomingCount = feed.incomingPending.length;
	const activeCount = feed.active.length + feed.outgoingPending.length;

	const defaultTab =
		incomingCount > 0 ? "incoming" : activeCount > 0 ? "active" : "new";

	return (
		<div className="space-y-4">
			<div>
				<h2 className="font-bold text-lg">Herausforderungen</h2>
				<p className="text-muted-foreground text-sm">
					Fordere jemanden heraus oder beantworte offene Spiele
				</p>
			</div>

			<Tabs defaultValue={defaultTab}>
				<TabsList className="grid w-full grid-cols-4">
					<TabsTrigger value="new">Neu</TabsTrigger>
					<TabsTrigger value="incoming">
						Eingehend{incomingCount > 0 ? ` (${incomingCount})` : ""}
					</TabsTrigger>
					<TabsTrigger value="active">
						Aktiv{activeCount > 0 ? ` (${activeCount})` : ""}
					</TabsTrigger>
					<TabsTrigger value="history">Verlauf</TabsTrigger>
				</TabsList>

				<TabsContent value="new">
					<CreateChallengeForm onCreated={refresh} />
				</TabsContent>

				<TabsContent value="incoming" className="space-y-3">
					{feed.incomingPending.length === 0 ? (
						<Empty>Keine eingehenden Herausforderungen</Empty>
					) : (
						feed.incomingPending.map((c) => (
							<ChallengeCard
								key={c.id}
								challenge={c}
								currentUserId={currentUserId}
								variant="incoming-pending"
							/>
						))
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
						</>
					)}
				</TabsContent>

				<TabsContent value="history" className="space-y-3">
					{feed.history.length === 0 ? (
						<Empty>Noch kein Verlauf</Empty>
					) : (
						feed.history.map((c) => (
							<ChallengeCard
								key={c.id}
								challenge={c}
								currentUserId={currentUserId}
								variant="history"
							/>
						))
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
