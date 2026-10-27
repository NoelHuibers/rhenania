import type * as React from "react";

import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

export const LOADING_LABEL = "Wird geladen…";

/**
 * Announces a loading region once to screen readers; the skeleton shapes
 * themselves are hidden from them. `label={null}` renders the shapes only,
 * for nesting inside another labelled skeleton.
 */
function LoadingRegion({
	label,
	className,
	children,
}: {
	label: string | null;
	className?: string;
	children: React.ReactNode;
}) {
	if (label === null) {
		return (
			<div aria-hidden="true" className={className}>
				{children}
			</div>
		);
	}
	return (
		<div role="status" data-slot="loading" className={className}>
			<span className="sr-only">{label}</span>
			{children}
		</div>
	);
}

type SkeletonProps = { label?: string | null; className?: string };

/** `[0, 1, …, n - 1]`, stable keys for placeholder shapes that never reorder. */
function range(n: number): number[] {
	return Array.from({ length: n }, (_, i) => i);
}

function Shapes({ children }: { children: React.ReactNode }) {
	return (
		<div aria-hidden="true" className="contents">
			{children}
		</div>
	);
}

/** Placeholder rows for a table or list that is still loading. */
export function TableSkeleton({
	rows = 5,
	columns = 4,
	label = LOADING_LABEL,
	className,
}: SkeletonProps & { rows?: number; columns?: number }) {
	const cols = range(columns);
	return (
		<LoadingRegion
			label={label}
			className={cn("w-full space-y-3 py-2", className)}
		>
			<Shapes>
				<div className="flex gap-4 pb-1">
					{cols.map((c) => (
						<Skeleton key={c} className="h-4 flex-1" />
					))}
				</div>
				{range(rows).map((r) => (
					<div key={r} className="flex gap-4">
						{cols.map((c) => (
							<Skeleton
								key={c}
								className={cn("h-8 flex-1", c === 0 && "flex-2")}
							/>
						))}
					</div>
				))}
			</Shapes>
		</LoadingRegion>
	);
}

/** Placeholder tiles for a grid of cards (menu items, articles). */
export function CardGridSkeleton({
	cards = 6,
	label = LOADING_LABEL,
	className,
}: SkeletonProps & { cards?: number }) {
	return (
		<LoadingRegion
			label={label}
			className={cn(
				"grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
				className,
			)}
		>
			<Shapes>
				{range(cards).map((i) => (
					<div key={i} className="space-y-3 rounded-xl border bg-card p-4">
						<Skeleton className="h-28 w-full" />
						<Skeleton className="h-4 w-2/3" />
						<Skeleton className="h-4 w-1/3" />
					</div>
				))}
			</Shapes>
		</LoadingRegion>
	);
}

/** A whole page body: KPI tiles above a table card. Used by loading.tsx. */
export function PageSkeleton({
	label = LOADING_LABEL,
	className,
}: SkeletonProps) {
	return (
		<LoadingRegion
			label={label}
			className={cn("space-y-6 p-4 md:p-6", className)}
		>
			<Shapes>
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{range(4).map((i) => (
						<div key={i} className="space-y-3 rounded-xl border bg-card p-4">
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-7 w-2/3" />
						</div>
					))}
				</div>
				<div className="space-y-4 rounded-xl border bg-card p-4">
					<Skeleton className="h-5 w-48" />
					<TableSkeleton label={null} rows={6} />
				</div>
			</Shapes>
		</LoadingRegion>
	);
}
