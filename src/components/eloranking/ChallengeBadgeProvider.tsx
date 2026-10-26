"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import { nextPollDelay, POLL_BASE_MS } from "~/lib/poll-backoff";
import {
	type ChallengeFeed,
	getMyChallenges,
} from "~/server/actions/game/challenge";

const EMPTY_FEED: ChallengeFeed = {
	incomingPending: [],
	outgoingPending: [],
	active: [],
	awaitingMyResult: [],
	awaitingMyConfirm: [],
	disputed: [],
	history: [],
};

export interface ChallengeBadgeValue {
	feed: ChallengeFeed;
	badgeCount: number;
	notificationsEnabled: boolean;
	refresh: () => Promise<void>;
}

const Context = createContext<ChallengeBadgeValue | null>(null);

export function useChallengeBadge(): ChallengeBadgeValue {
	const v = useContext(Context);
	if (!v) {
		return {
			feed: EMPTY_FEED,
			badgeCount: 0,
			notificationsEnabled: false,
			refresh: async () => {
				// Default outside the provider: nothing to refresh.
			},
		};
	}
	return v;
}

/** A challenge is in flight: its deadlines are minutes, so poll at the base rate. */
function isBusy(feed: ChallengeFeed): boolean {
	return (
		feed.incomingPending.length > 0 ||
		feed.outgoingPending.length > 0 ||
		feed.active.length > 0
	);
}

export function ChallengeBadgeProvider({
	children,
	notificationsEnabled,
}: {
	children: React.ReactNode;
	notificationsEnabled: boolean;
}) {
	const [feed, setFeed] = useState<ChallengeFeed>(EMPTY_FEED);
	const inFlightRef = useRef(false);
	const signatureRef = useRef<string | null>(null);
	const delayRef = useRef(POLL_BASE_MS);
	const lastPollRef = useRef(0);

	const refresh = useCallback(async () => {
		if (inFlightRef.current) {
			return;
		}
		inFlightRef.current = true;
		lastPollRef.current = Date.now();
		try {
			const f = await getMyChallenges();
			const signature = JSON.stringify(f);
			const changed = signature !== signatureRef.current;
			signatureRef.current = signature;
			delayRef.current = nextPollDelay(delayRef.current, {
				changed,
				busy: isBusy(f),
			});
			if (changed) {
				setFeed(f);
			}
		} catch (err) {
			console.error("Challenge feed fetch failed:", err);
			delayRef.current = nextPollDelay(delayRef.current, {
				changed: false,
				busy: false,
			});
		} finally {
			inFlightRef.current = false;
		}
	}, []);

	// Polls while the tab is visible, backing off while nothing changes
	// (see nextPollDelay); hidden tabs do not poll at all.
	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		let disposed = false;

		const clear = () => {
			if (timer != null) {
				clearTimeout(timer);
				timer = null;
			}
		};
		const schedule = () => {
			clear();
			if (disposed || document.hidden) {
				return;
			}
			timer = setTimeout(async () => {
				timer = null;
				await refresh();
				schedule();
			}, delayRef.current);
		};
		const pollNow = async () => {
			delayRef.current = POLL_BASE_MS;
			await refresh();
			schedule();
		};

		const onVisibility = () => {
			if (document.hidden) {
				clear();
			} else {
				void pollNow();
			}
		};
		// Back in a window that stayed visible: catch up if the last poll is old.
		const onFocus = () => {
			if (Date.now() - lastPollRef.current >= POLL_BASE_MS) {
				void pollNow();
			}
		};

		void pollNow();
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("focus", onFocus);

		return () => {
			disposed = true;
			clear();
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("focus", onFocus);
		};
	}, [refresh]);

	const badgeCount =
		feed.incomingPending.length + feed.awaitingMyConfirm.length;

	return (
		<Context.Provider
			value={{
				feed,
				badgeCount,
				notificationsEnabled,
				refresh,
			}}
		>
			{children}
		</Context.Provider>
	);
}
