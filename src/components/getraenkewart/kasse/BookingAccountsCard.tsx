"use client";

import {
	Archive,
	ArchiveRestore,
	ArrowDown,
	ArrowUp,
	Plus,
	Tags,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ConfirmAction } from "~/components/ui/confirm-action";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import type { ActionResult } from "~/lib/action-result";
import {
	accountNameProblem,
	MAX_ACCOUNT_NAME_LENGTH,
	normalizeAccountName,
} from "~/lib/booking-accounts";
import { formatEUR } from "~/lib/format";
import {
	addBookingAccount,
	deleteBookingAccount,
	type ManagedBookingAccount,
	moveBookingAccount,
	setBookingAccountArchived,
	setBookingAccountPinned,
} from "~/server/modules/booking-accounts/actions";
import { CollapsibleCard } from "./shared";

/**
 * The group accounts members can book drinks on ("Auf ein Konto buchen"):
 * add them, choose which are chips on the Getränkekarte and in which order,
 * archive the ones no longer needed. Each shows what is booked on it and
 * not billed yet.
 */
export function BookingAccountsCard({
	accounts,
}: {
	accounts: ManagedBookingAccount[];
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const active = accounts.filter((a) => !a.archived);
	const archived = accounts.filter((a) => a.archived);
	const unbilled = accounts.reduce((s, a) => s + a.unbilledTotal, 0);

	function run(call: () => Promise<ActionResult<unknown>>, success?: string) {
		startTransition(async () => {
			const res = await call();
			if (res.ok) {
				if (success) {
					toast.success(success);
				}
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<CollapsibleCard
			title="Buchungskonten"
			meta={
				<span className="text-muted-foreground text-xs">
					{active.length} aktiv
					{unbilled > 0 ? ` • ${formatEUR(unbilled)} offen` : ""}
				</span>
			}
			action={
				<AddAccountDialog
					existing={accounts.map((a) => a.name)}
					onAdded={() => router.refresh()}
				/>
			}
		>
			<p className="px-6 pb-3 text-muted-foreground text-sm">
				Konten, auf die Getränke gebucht werden können. Als Chip markierte
				erscheinen direkt auf der Getränkekarte, die übrigen unter „Weitere“.
			</p>
			{active.length === 0 ? (
				<EmptyState
					variant="plain"
					className="py-6"
					icon={<Tags />}
					title="Keine Buchungskonten"
				>
					Ohne Konten bucht jeder auf eigene Kosten.
				</EmptyState>
			) : (
				<ul className="divide-y border-t">
					{active.map((account, i) => (
						<li
							key={account.id}
							className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2"
						>
							<AccountName account={account} />
							<div className="ml-auto flex items-center gap-1">
								<PinSwitch
									account={account}
									disabled={isPending}
									onChange={(pinned) =>
										run(() => setBookingAccountPinned(account.id, pinned))
									}
								/>
								<IconButton
									label={`${account.name} nach oben`}
									size="icon-sm"
									disabled={isPending || i === 0}
									onClick={() =>
										run(() => moveBookingAccount(account.id, "up"))
									}
								>
									<ArrowUp className="size-4" />
								</IconButton>
								<IconButton
									label={`${account.name} nach unten`}
									size="icon-sm"
									disabled={isPending || i === active.length - 1}
									onClick={() =>
										run(() => moveBookingAccount(account.id, "down"))
									}
								>
									<ArrowDown className="size-4" />
								</IconButton>
								<IconButton
									label={`${account.name} archivieren`}
									size="icon-sm"
									disabled={isPending}
									onClick={() =>
										run(
											() => setBookingAccountArchived(account.id, true),
											`${account.name} archiviert`,
										)
									}
								>
									<Archive className="size-4" />
								</IconButton>
							</div>
						</li>
					))}
				</ul>
			)}
			{archived.length > 0 && (
				<div className="border-t">
					<p className="px-6 pt-3 pb-1 font-medium text-muted-foreground text-xs">
						Archiviert – nicht mehr auf der Getränkekarte
					</p>
					<ul className="divide-y">
						{archived.map((account) => (
							<li
								key={account.id}
								className="flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-2 text-muted-foreground"
							>
								<AccountName account={account} />
								<div className="ml-auto flex items-center gap-1">
									<IconButton
										label={`${account.name} wiederherstellen`}
										size="icon-sm"
										disabled={isPending}
										onClick={() =>
											run(
												() => setBookingAccountArchived(account.id, false),
												`${account.name} wiederhergestellt`,
											)
										}
									>
										<ArchiveRestore className="size-4" />
									</IconButton>
									<ConfirmAction
										title={`„${account.name}“ löschen?`}
										description="Geht nur, wenn noch nie auf das Konto gebucht wurde."
										onConfirm={() =>
											run(
												() => deleteBookingAccount(account.id),
												`${account.name} gelöscht`,
											)
										}
									>
										<IconButton
											label={`${account.name} löschen`}
											size="icon-sm"
											disabled={isPending}
										>
											<Trash2 className="size-4" />
										</IconButton>
									</ConfirmAction>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</CollapsibleCard>
	);
}

function AccountName({ account }: { account: ManagedBookingAccount }) {
	return (
		<div className="min-w-0">
			<div className="truncate font-medium">{account.name}</div>
			{account.unbilledOrders > 0 && (
				<div className="text-muted-foreground text-xs">
					{account.unbilledOrders} offene{" "}
					{account.unbilledOrders === 1 ? "Buchung" : "Buchungen"} •{" "}
					{formatEUR(account.unbilledTotal)}
				</div>
			)}
		</div>
	);
}

function PinSwitch({
	account,
	disabled,
	onChange,
}: {
	account: ManagedBookingAccount;
	disabled: boolean;
	onChange: (pinned: boolean) => void;
}) {
	const id = useId();
	return (
		<div className="mr-1 flex items-center gap-1.5">
			<Switch
				id={id}
				checked={account.pinned}
				disabled={disabled}
				onCheckedChange={onChange}
			/>
			<Label htmlFor={id} className="font-normal text-sm">
				Chip
			</Label>
		</div>
	);
}

function AddAccountDialog({
	existing,
	onAdded,
}: {
	existing: string[];
	onAdded: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [pinned, setPinned] = useState(true);
	const [touched, setTouched] = useState(false);
	const [isPending, startTransition] = useTransition();

	const normalized = normalizeAccountName(name);
	const problem = accountNameProblem(normalized, existing);

	function reset() {
		setName("");
		setPinned(true);
		setTouched(false);
	}

	function handleAdd(e: React.FormEvent) {
		e.preventDefault();
		setTouched(true);
		if (problem) {
			return;
		}
		startTransition(async () => {
			const res = await addBookingAccount(normalized, pinned);
			if (res.ok) {
				toast.success(`${normalized} angelegt`);
				setOpen(false);
				reset();
				onAdded();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					reset();
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					onClick={(e) => e.stopPropagation()}
				>
					<Plus className="mr-1 size-4" />
					Neu
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={handleAdd}>
					<DialogHeader>
						<DialogTitle>Buchungskonto anlegen</DialogTitle>
						<DialogDescription>
							Der Name steht auf der Gruppenrechnung und lässt sich später nicht
							mehr ändern.
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-4 py-4">
						<div className="grid gap-1.5">
							<Label htmlFor="booking-account-name">Name</Label>
							<Input
								id="booking-account-name"
								placeholder="z. B. Kneipe mit Hassia"
								value={name}
								maxLength={MAX_ACCOUNT_NAME_LENGTH}
								onChange={(e) => setName(e.target.value)}
								onBlur={() => setTouched(true)}
								aria-invalid={touched && problem !== null}
								aria-describedby="booking-account-problem"
							/>
							<p
								id="booking-account-problem"
								className="min-h-5 text-destructive text-sm"
							>
								{touched ? problem : null}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Switch
								id="booking-account-pinned"
								checked={pinned}
								onCheckedChange={setPinned}
							/>
							<Label htmlFor="booking-account-pinned" className="font-normal">
								Als Chip direkt auf der Getränkekarte zeigen
							</Label>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={isPending}>
							Anlegen
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
