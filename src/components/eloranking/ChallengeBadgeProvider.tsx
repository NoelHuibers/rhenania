"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import {
	type ChallengeFeed,
	getMyChallenges,
} from "~/server/actions/game/challenge";

const POLL_INTERVAL_MS = 20_000;

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
			refresh: async () => {},
		};
	}
	return v;
}

export function ChallengeBadgeProvider({
	children,
	notificationsEnabled,
}: {
	children: React.ReactNode;
	notificationsEnabled: boolean;
}) {
	const [feed, setFeed] = useState<ChallengeFeed>(EMPTY_FEED);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const inFlightRef = useRef(false);

	const refresh = useCallback(async () => {
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		try {
			const f = await getMyChallenges();
			setFeed(f);
		} catch (err) {
			console.error("Challenge feed fetch failed:", err);
		} finally {
			inFlightRef.current = false;
		}
	}, []);

	useEffect(() => {
		void refresh();

		const start = () => {
			if (timerRef.current != null) return;
			timerRef.current = setInterval(() => {
				if (!document.hidden) void refresh();
			}, POLL_INTERVAL_MS);
		};
		const stop = () => {
			if (timerRef.current != null) {
				clearInterval(timerRef.current);
				timerRef.current = null;
			}
		};

		const onVisibility = () => {
			if (document.hidden) {
				stop();
			} else {
				void refresh();
				start();
			}
		};

		if (!document.hidden) start();
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			stop();
			document.removeEventListener("visibilitychange", onVisibility);
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
