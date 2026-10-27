"use client";

import { Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { cn } from "~/lib/utils";
import type { MemberListItem } from "~/server/actions/members/members";
import { MemberStatusBadge } from "./MemberStatusBadge";
import { avatarColorClasses, memberInitials } from "./member-constants";
import { type EditableKey, memberName } from "./member-edits";

const INPUT_CLS =
	"w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none transition-colors hover:border-border hover:bg-muted/30 focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/25 disabled:cursor-default disabled:hover:border-transparent disabled:hover:bg-transparent " +
	// Unsaved: amber frame and tint. Saving: dimmed. Failed: red frame.
	"data-[state=dirty]:border-warning-muted-foreground data-[state=dirty]:bg-warning-muted data-[state=saving]:opacity-60 aria-invalid:border-destructive aria-invalid:bg-danger-muted";

export type CellStatus = "saving" | { error: string } | undefined;

/** Props every editable cell gets from the table. */
export type CellProps = {
	/** The saved value. */
	value: string;
	/** An unsaved value, if the cell was edited and left. */
	draft: string | undefined;
	label: string;
	column: EditableKey;
	disabled: boolean;
	status: CellStatus;
	describedBy: { dirty: string; error: string };
	onCommit: (text: string) => void;
	onLeave: (text: string) => void;
	onRevert: () => void;
};

/** Moves focus to the same column in the row above or below. */
function focusSibling(from: HTMLElement, dir: -1 | 1) {
	const row = from.closest("tr");
	const col = from.dataset.col;
	const next =
		dir === -1 ? row?.previousElementSibling : row?.nextElementSibling;
	next?.querySelector<HTMLElement>(`[data-col="${col}"]`)?.focus();
}

function cellState(dirty: boolean, status: CellStatus) {
	if (status === "saving") {
		return "saving";
	}
	return dirty ? "dirty" : undefined;
}

/**
 * A text cell. Typing only changes the cell; Enter saves it, Escape puts
 * the saved value back, and leaving it keeps the edit as an unsaved draft
 * (marked, and listed in the save bar) instead of saving silently.
 */
export function TextCell({
	value,
	draft,
	label,
	column,
	disabled,
	status,
	describedBy,
	onCommit,
	onLeave,
	onRevert,
	list,
	autoFocus,
	onClose,
}: CellProps & {
	list?: string;
	autoFocus?: boolean;
	/** For cells that are only an input while editing (status). */
	onClose?: (how: "commit" | "revert" | "leave") => void;
}) {
	const external = draft ?? value;
	const [text, setText] = useState(external);
	const [seen, setSeen] = useState(external);
	// A save, a discard or fresh server data replaces what the cell shows.
	if (external !== seen) {
		setSeen(external);
		setText(external);
	}
	const dirty = text !== value;
	const error = typeof status === "object" ? status.error : undefined;
	// Set once Enter or Escape closed a status editor: some browsers fire
	// blur while removing the input, which must not re-add the edit.
	const closed = useRef(false);
	const close = (how: "commit" | "revert") => {
		if (onClose) {
			closed.current = true;
			onClose(how);
		}
	};

	return (
		<input
			// biome-ignore lint/a11y/noAutofocus: the status cell opens on request and takes focus
			autoFocus={autoFocus}
			value={text}
			disabled={disabled}
			list={list}
			aria-label={label}
			aria-invalid={error ? true : undefined}
			aria-busy={status === "saving" || undefined}
			aria-describedby={
				error ? describedBy.error : dirty ? describedBy.dirty : undefined
			}
			data-col={column}
			data-state={cellState(dirty, status)}
			onChange={(e) => setText(e.target.value)}
			onBlur={() => {
				if (closed.current) {
					return;
				}
				onLeave(text);
				onClose?.("leave");
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					// Back at the saved value: nothing to save, drop any draft.
					if (dirty) {
						onCommit(text);
					} else {
						onRevert();
					}
					close("commit");
				} else if (e.key === "Escape") {
					if (dirty || onClose) {
						e.preventDefault();
						setText(value);
						onRevert();
						close("revert");
					}
				} else if (
					(e.key === "ArrowUp" || e.key === "ArrowDown") &&
					!list &&
					!e.altKey &&
					!e.shiftKey
				) {
					e.preventDefault();
					focusSibling(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
				}
			}}
			className={INPUT_CLS}
		/>
	);
}

/** The Abteilung shows as a badge; activating it opens a text field. */
export function StatusCell(props: CellProps) {
	const { value, draft, label, disabled, status } = props;
	const [editing, setEditing] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const refocus = useRef(false);
	const shown = draft ?? value;
	const error = typeof status === "object" ? status.error : undefined;

	useEffect(() => {
		if (!editing && refocus.current) {
			refocus.current = false;
			buttonRef.current?.focus();
		}
	}, [editing]);

	if (!disabled && editing) {
		return (
			<TextCell
				{...props}
				list="member-status-options"
				autoFocus
				onClose={(how) => {
					// Enter and Escape return focus to the badge; leaving does not.
					if (how !== "leave") {
						refocus.current = true;
					}
					setEditing(false);
				}}
			/>
		);
	}
	return (
		<button
			ref={buttonRef}
			type="button"
			disabled={disabled}
			data-col={props.column}
			// The badge text is part of the name (WCAG 2.5.3).
			aria-label={`${label}: ${shown || "leer"}`}
			aria-invalid={error ? true : undefined}
			aria-describedby={
				error
					? props.describedBy.error
					: draft !== undefined
						? props.describedBy.dirty
						: undefined
			}
			onClick={() => setEditing(true)}
			onKeyDown={(e) => {
				if (e.key === "ArrowUp" || e.key === "ArrowDown") {
					e.preventDefault();
					focusSibling(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
				}
			}}
			className={cn(
				"flex w-full items-center rounded-md border border-transparent px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
				draft !== undefined &&
					"border-warning-muted-foreground bg-warning-muted",
				error && "border-destructive",
				status === "saving" && "opacity-60",
			)}
		>
			<MemberStatusBadge status={shown} />
		</button>
	);
}

/** Avatar, name and account link of a member. */
export function Identity({ m }: { m: MemberListItem }) {
	return (
		<div className="flex items-center gap-2.5 py-1 pr-2 pl-1">
			<Avatar size="sm" className="shrink-0" aria-hidden="true">
				<AvatarFallback
					className={cn(
						"font-semibold text-[11px]",
						avatarColorClasses(m.lastName + m.firstName),
					)}
				>
					{memberInitials(m.firstName, m.lastName)}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0">
				<div className="truncate font-medium leading-tight">
					{memberName(m)}
				</div>
				{m.linked && (
					<span className="mt-0.5 flex items-center gap-1 font-normal text-[11px] text-muted-foreground">
						<Link2 className="h-3 w-3" aria-hidden="true" /> Account
					</span>
				)}
			</div>
		</div>
	);
}
