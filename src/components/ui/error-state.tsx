import { AlertTriangle, RefreshCw } from "lucide-react";
import type * as React from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type ErrorStateProps = {
	title?: string;
	/** What happened, in words for members. Never an error message or stack. */
	children?: React.ReactNode;
	/** Next's error digest; shown so a member can quote it to the admin. */
	digest?: string;
	onRetry?: () => void;
	retryLabel?: string;
	/** A secondary way out, e.g. a link to the start page. */
	action?: React.ReactNode;
	className?: string;
};

export const ERROR_STATE_DEFAULT_TITLE = "Etwas ist schiefgelaufen";
const DEFAULT_TEXT =
	"Die Seite konnte nicht geladen werden. Versuche es noch einmal. Wenn der Fehler bleibt, melde dich beim Admin.";
const DEFAULT_TEXT_WITH_CODE =
	"Die Seite konnte nicht geladen werden. Versuche es noch einmal. Wenn der Fehler bleibt, melde dich mit dem Fehlercode unten beim Admin.";

/**
 * A recoverable error: German explanation, a retry button and the digest
 * for support. Only pass text written for members, never the error itself:
 * server messages are generic in production and may leak details in dev.
 */
export function ErrorState({
	title = ERROR_STATE_DEFAULT_TITLE,
	children,
	digest,
	onRetry,
	retryLabel = "Erneut versuchen",
	action,
	className,
}: ErrorStateProps) {
	return (
		<div
			data-slot="error-state"
			role="alert"
			className={cn(
				"mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-12 text-center",
				className,
			)}
		>
			<div
				aria-hidden="true"
				className="flex size-12 items-center justify-center rounded-full bg-danger-muted text-danger-muted-foreground"
			>
				<AlertTriangle className="size-6" />
			</div>
			<h2 className="font-semibold text-lg">{title}</h2>
			<div className="text-muted-foreground text-sm">
				{children ?? (digest ? DEFAULT_TEXT_WITH_CODE : DEFAULT_TEXT)}
			</div>
			{(onRetry || action) && (
				<div className="mt-2 flex flex-wrap justify-center gap-2">
					{onRetry && (
						<Button type="button" onClick={onRetry}>
							<RefreshCw />
							{retryLabel}
						</Button>
					)}
					{action}
				</div>
			)}
			{digest && (
				<p className="mt-2 text-muted-foreground text-xs">
					Fehlercode:{" "}
					<code className="select-all rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
						{digest}
					</code>
				</p>
			)}
		</div>
	);
}
