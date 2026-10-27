import type * as React from "react";

import { cn } from "~/lib/utils";

/**
 * The one grouped-list card (#87): a tinted header with a heading, an
 * optional line below it and a right-aligned summary, then the content,
 * usually a `<ul className="divide-y">` of rows.
 */
export function SectionCard({
	title,
	headingLevel = 3,
	meta,
	aside,
	className,
	children,
}: {
	title: React.ReactNode;
	/** Heading level of the title, to fit the page outline (default h3). */
	headingLevel?: 2 | 3 | 4;
	/** A small line under the title (counts, totals). */
	meta?: React.ReactNode;
	/** Right-aligned summary in the header (an amount, a status). */
	aside?: React.ReactNode;
	className?: string;
	children?: React.ReactNode;
}) {
	const Heading = `h${headingLevel}` as const;
	return (
		<section
			data-slot="section-card"
			className={cn(
				"overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2.5">
				<div className="min-w-0">
					<Heading className="truncate font-semibold text-sm">{title}</Heading>
					{meta && (
						<div className="text-muted-foreground text-xs tabular-nums">
							{meta}
						</div>
					)}
				</div>
				{aside && <div className="shrink-0 text-right">{aside}</div>}
			</div>
			{children}
		</section>
	);
}
