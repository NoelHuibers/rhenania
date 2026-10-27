"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks whether a horizontally scrollable element has more content to the
 * left or right, and scrolls it by most of its width. `remeasure` lists the
 * values that change its content (data, filters, visible columns).
 */
export function useHorizontalOverflow(remeasure: unknown[]) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState({ left: false, right: false });

	const updateOverflow = useCallback(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		setOverflow({
			left: el.scrollLeft > 1,
			right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
		});
	}, []);

	const scrollByX = (dir: 1 | -1) => {
		const el = scrollRef.current;
		if (el) {
			el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
		}
	};

	// Recompute horizontal overflow when size, data or visible columns
	// change; `remeasure` only triggers the effect.
	useEffect(() => {
		const el = scrollRef.current;
		if (!el) {
			return;
		}
		updateOverflow();
		const ro = new ResizeObserver(updateOverflow);
		ro.observe(el);
		return () => ro.disconnect();
	}, [updateOverflow, ...remeasure]);

	return { scrollRef, overflow, updateOverflow, scrollByX };
}
