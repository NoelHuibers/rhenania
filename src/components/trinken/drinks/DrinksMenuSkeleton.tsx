import { Skeleton } from "~/components/ui/skeleton";

/** Same boxes as DrinksMenu, so nothing shifts when the drinks arrive. */
export function DrinksMenuSkeleton() {
	return (
		<div
			role="status"
			aria-busy="true"
			aria-label="Getränkekarte wird geladen"
			className="container mx-auto space-y-3 p-4"
		>
			<Skeleton className="h-6 w-24" />
			<Skeleton className="h-4 w-48" />
			<div className="flex gap-2">
				{["a", "b", "c", "d"].map((k) => (
					<Skeleton key={k} className="h-11 w-16" />
				))}
			</div>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
				{["a", "b", "c", "d", "e", "f"].map((k) => (
					<Skeleton key={k} className="h-[74px] w-full rounded-lg" />
				))}
			</div>
		</div>
	);
}
