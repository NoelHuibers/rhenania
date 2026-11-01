// challenges.ts — the rules of a challenge that need no database (#33).
//
// Pure. The deadlines, who pays the drinks of a settled challenge, and how
// a player's challenges are sorted into the feed (intra- and cross-Corps).

export const RESPOND_WINDOW_MS = 30 * 60 * 1000; // 30 min to accept
export const PLAY_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 h to propose result
export const CONFIRM_WINDOW_MS = 10 * 60 * 1000; // 10 min to confirm
export const DECLINE_COOLDOWN_MS = 60 * 60 * 1000; // 1 h cooldown after decline

export type ChallengeStatus =
	| "pending"
	| "accepted"
	| "result_proposed"
	| "confirmed" // claimed: settlement in progress
	| "settled"
	| "declined"
	| "expired"
	| "cancelled"
	| "disputed";

export type PaymentRule = "challenger" | "loser" | "split";
export type CrossPaymentRule = "none" | PaymentRule;

export interface ChallengeView {
	id: string;
	status: ChallengeStatus;
	payment: PaymentRule;
	quantity: number;
	drinkId: string;
	drinkName: string;
	drinkPrice: number;
	challengerId: string;
	challengerName: string | null;
	challengerAvatar: string | null;
	opponentId: string;
	opponentName: string | null;
	opponentAvatar: string | null;
	proposedWinnerId: string | null;
	proposedById: string | null;
	createdAt: Date;
	acceptedAt: Date | null;
	respondDeadline: Date;
	playDeadline: Date | null;
	confirmDeadline: Date | null;
	gameId: string | null;
	role: "challenger" | "opponent";
}

export interface CrossChallengeView {
	id: string;
	status: ChallengeStatus;
	payment: CrossPaymentRule;
	quantity: number;
	drinkName: string | null;
	challengerId: string;
	challengerName: string | null;
	challengerTenantSlug: string;
	challengerTenantName: string;
	opponentId: string;
	opponentName: string | null;
	opponentTenantSlug: string;
	opponentTenantName: string;
	proposedWinnerId: string | null;
	proposedById: string | null;
	createdAt: Date;
	acceptedAt: Date | null;
	respondDeadline: Date;
	playDeadline: Date | null;
	confirmDeadline: Date | null;
	gameId: string | null;
	role: "challenger" | "opponent";
}

export interface Feed<V> {
	incomingPending: V[];
	outgoingPending: V[];
	active: V[];
	awaitingMyResult: V[]; // accepted, I haven't proposed yet
	awaitingMyConfirm: V[]; // result_proposed by opponent, I must confirm
	disputed: V[];
	history: V[];
}

export type ChallengeFeed = Feed<ChallengeView>;
export type CrossChallengeFeed = Feed<CrossChallengeView>;

export function emptyFeed<V>(): Feed<V> {
	return {
		incomingPending: [],
		outgoingPending: [],
		active: [],
		awaitingMyResult: [],
		awaitingMyConfirm: [],
		disputed: [],
		history: [],
	};
}

/** Sorts a player's intra-Corps challenges into the feed. */
export function challengeFeed(
	views: ChallengeView[],
	userId: string,
): ChallengeFeed {
	const feed = emptyFeed<ChallengeView>();
	for (const v of views) {
		const isMine = v.role === "challenger";

		if (v.status === "pending") {
			if (isMine) {
				feed.outgoingPending.push(v);
			} else {
				feed.incomingPending.push(v);
			}
		} else if (v.status === "accepted") {
			feed.active.push(v);
			feed.awaitingMyResult.push(v);
		} else if (v.status === "result_proposed") {
			feed.active.push(v);
			if (v.proposedById !== userId) {
				feed.awaitingMyConfirm.push(v);
			}
		} else if (v.status === "disputed") {
			feed.disputed.push(v);
			feed.active.push(v);
		} else {
			feed.history.push(v);
		}
	}
	return feed;
}

/**
 * Sorts a player's cross-Corps challenges into the feed. Unlike the
 * intra-Corps feed, a running challenge is in exactly one list.
 */
export function crossChallengeFeed(
	views: CrossChallengeView[],
	userId: string,
): CrossChallengeFeed {
	const feed = emptyFeed<CrossChallengeView>();
	for (const view of views) {
		switch (view.status) {
			case "pending":
				if (view.role === "challenger") {
					feed.outgoingPending.push(view);
				} else {
					feed.incomingPending.push(view);
				}
				break;
			case "accepted":
				feed.awaitingMyResult.push(view);
				break;
			case "result_proposed":
				if (view.proposedById === userId) {
					feed.active.push(view);
				} else {
					feed.awaitingMyConfirm.push(view);
				}
				break;
			case "disputed":
				feed.disputed.push(view);
				break;
			default:
				feed.history.push(view);
		}
	}
	return feed;
}

type Player = { id: string; name: string | null; email: string | null };
export type PlannedOrder = { userId: string; userName: string; amount: number };

/**
 * Who pays how many of the challenge's drinks. "split" halves them; an odd
 * remainder goes to the challenger.
 */
export function plannedOrders(
	challenge: { challengerId: string; payment: string; quantity: number },
	winner: Player,
	loser: Player,
): PlannedOrder[] {
	const planned: PlannedOrder[] = [];
	const challengerIsWinner = challenge.challengerId === winner.id;
	const winnerName = winner.name || winner.email || "Unbekannt";
	const loserName = loser.name || loser.email || "Unbekannt";
	const challengerName = challengerIsWinner ? winnerName : loserName;
	const challengerUserId = challenge.challengerId;

	switch (challenge.payment) {
		case "challenger":
			planned.push({
				userId: challengerUserId,
				userName: challengerName,
				amount: challenge.quantity,
			});
			break;
		case "loser":
			planned.push({
				userId: loser.id,
				userName: loserName,
				amount: challenge.quantity,
			});
			break;
		case "split": {
			const each = Math.floor(challenge.quantity / 2);
			const rem = challenge.quantity - each * 2;
			// Even split; if odd remainder, challenger absorbs it
			planned.push({
				userId: challengerUserId,
				userName: challengerName,
				amount: each + rem,
			});
			planned.push({
				userId: challengerIsWinner ? loser.id : winner.id,
				userName: challengerIsWinner ? loserName : winnerName,
				amount: each,
			});
			break;
		}
	}
	return planned;
}

/** ELO before and after for player 1 (challenger) and player 2. */
export function gameElo(
	challengerIsWinner: boolean,
	elo: {
		winnerEloBefore: number;
		loserEloBefore: number;
		winnerEloAfter: number;
		loserEloAfter: number;
	},
) {
	return {
		player1EloBefore: challengerIsWinner
			? elo.winnerEloBefore
			: elo.loserEloBefore,
		player2EloBefore: challengerIsWinner
			? elo.loserEloBefore
			: elo.winnerEloBefore,
		player1EloAfter: challengerIsWinner
			? elo.winnerEloAfter
			: elo.loserEloAfter,
		player2EloAfter: challengerIsWinner
			? elo.loserEloAfter
			: elo.winnerEloAfter,
	};
}
