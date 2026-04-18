"use client";

import { Check, HelpCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
	type RsvpCounts,
	type RsvpStatus,
	removeRsvp,
	setRsvp,
} from "~/server/actions/events/rsvp";

type Props = {
	eventId: string;
	isCancelled: boolean;
	rsvpDeadline: Date | null;
	maxAttendees: number | null;
	counts: RsvpCounts;
	currentStatus: RsvpStatus | null;
};

export function RsvpControls({
	eventId,
	isCancelled,
	rsvpDeadline,
	maxAttendees,
	counts,
	currentStatus,
}: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [optimistic, setOptimistic] = useState<RsvpStatus | null>(
		currentStatus,
	);

	const deadlinePassed =
		rsvpDeadline != null && rsvpDeadline.getTime() < Date.now();
	const disabled = isCancelled || deadlinePassed || isPending;
	const capacityFull =
		maxAttendees != null && counts.yes >= maxAttendees && optimistic !== "yes";

	function apply(next: RsvpStatus) {
		setError(null);
		const previous = optimistic;
		const target = previous === next ? null : next;
		setOptimistic(target);

		startTransition(async () => {
			const result =
				target == null
					? await removeRsvp(eventId)
					: await setRsvp(eventId, target);
			if (!result.success) {
				setOptimistic(previous);
				setError(result.message);
				return;
			}
			router.refresh();
		});
	}

	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1.5">
				<RsvpButton
					active={optimistic === "yes"}
					disabled={disabled || capacityFull}
					onClick={() => apply("yes")}
					icon={<Check className="h-3 w-3 shrink-0" />}
					label="Zusagen"
					activeClass="bg-green-600 text-white hover:bg-green-700"
				/>
				<RsvpButton
					active={optimistic === "maybe"}
					disabled={disabled}
					onClick={() => apply("maybe")}
					icon={<HelpCircle className="h-3 w-3 shrink-0" />}
					label="Vielleicht"
					activeClass="bg-amber-500 text-white hover:bg-amber-600"
				/>
				<RsvpButton
					active={optimistic === "no"}
					disabled={disabled}
					onClick={() => apply("no")}
					icon={<X className="h-3 w-3 shrink-0" />}
					label="Absagen"
					activeClass="bg-red-600 text-white hover:bg-red-700"
				/>
				{maxAttendees != null && (
					<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
						{counts.yes}/{maxAttendees}
					</span>
				)}
			</div>
			{deadlinePassed && !isCancelled && (
				<p className="text-muted-foreground text-xs">
					Antwortfrist abgelaufen.
				</p>
			)}
			{capacityFull && !deadlinePassed && !isCancelled && (
				<p className="text-muted-foreground text-xs">Kapazität erreicht.</p>
			)}
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}

function RsvpButton({
	active,
	disabled,
	onClick,
	icon,
	label,
	activeClass,
}: {
	active: boolean;
	disabled: boolean;
	onClick: () => void;
	icon: React.ReactNode;
	label: string;
	activeClass: string;
}) {
	return (
		<Button
			type="button"
			size="sm"
			variant={active ? "default" : "outline"}
			disabled={disabled}
			onClick={onClick}
			aria-label={label}
			title={label}
			className={`h-7 min-w-0 flex-1 gap-1 px-2 text-xs ${active ? activeClass : ""}`}
		>
			{icon}
			<span className="hidden truncate sm:inline">{label}</span>
		</Button>
	);
}
