"use client";

import { Swords } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { createCrossTenantChallenge } from "~/server/actions/game/cross-tenant-challenge";
import {
	type ChallengeableTenant,
	type ChallengeableUser,
	listChallengeableTenants,
	listChallengeableUsers,
} from "~/server/actions/game/cross-tenant-discovery";

type Payment = "none" | "challenger" | "loser" | "split";

export function CrossChallengeDialog() {
	const [open, setOpen] = useState(false);
	const [tenants, setTenants] = useState<ChallengeableTenant[]>([]);
	const [tenantId, setTenantId] = useState<string>("");
	const [members, setMembers] = useState<ChallengeableUser[]>([]);
	const [opponentId, setOpponentId] = useState<string>("");
	const [payment, setPayment] = useState<Payment>("none");
	const [drinkName, setDrinkName] = useState("");
	const [quantity, setQuantity] = useState(2);
	const [isPending, startTransition] = useTransition();

	// Load tenant list when the dialog opens.
	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		listChallengeableTenants().then((rows) => {
			if (!cancelled) setTenants(rows);
		});
		return () => {
			cancelled = true;
		};
	}, [open]);

	// Load members when a tenant is picked.
	useEffect(() => {
		if (!tenantId) {
			setMembers([]);
			setOpponentId("");
			return;
		}
		let cancelled = false;
		listChallengeableUsers(tenantId).then((rows) => {
			if (!cancelled) {
				setMembers(rows);
				setOpponentId("");
			}
		});
		return () => {
			cancelled = true;
		};
	}, [tenantId]);

	const reset = () => {
		setTenantId("");
		setOpponentId("");
		setPayment("none");
		setDrinkName("");
		setQuantity(2);
	};

	const submit = () => {
		if (!tenantId || !opponentId) {
			toast.error("Wähle ein Corps und einen Gegner");
			return;
		}
		startTransition(async () => {
			const r = await createCrossTenantChallenge({
				opponentId,
				opponentTenantId: tenantId,
				payment,
				drinkName: drinkName.trim() || null,
				quantity,
			});
			if (r.success) {
				toast.success("Cross-Corps-Herausforderung gesendet");
				reset();
				setOpen(false);
			} else {
				toast.error(r.error ?? "Fehler beim Erstellen");
			}
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o && !isPending) reset();
				setOpen(o);
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Swords className="mr-2 h-4 w-4" />
					Anderes Corps fordern
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Cross-Corps-Herausforderung</DialogTitle>
					<DialogDescription>
						Fordere einen Spieler aus einem anderen Corps. Standardmäßig wird
						kein Getränk verbucht — abgerechnet wird offline.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-1">
						<Label htmlFor="tenant">Corps</Label>
						<Select value={tenantId} onValueChange={setTenantId}>
							<SelectTrigger id="tenant" disabled={isPending}>
								<SelectValue placeholder="Corps auswählen" />
							</SelectTrigger>
							<SelectContent>
								{tenants.length === 0 ? (
									<SelectItem value="__empty" disabled>
										Keine anderen Corps verfügbar
									</SelectItem>
								) : (
									tenants.map((t) => (
										<SelectItem key={t.id} value={t.id}>
											{t.displayName} ({t.memberCount})
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-1">
						<Label htmlFor="opponent">Gegner</Label>
						<Select
							value={opponentId}
							onValueChange={setOpponentId}
							disabled={!tenantId}
						>
							<SelectTrigger id="opponent" disabled={isPending || !tenantId}>
								<SelectValue
									placeholder={
										tenantId ? "Spieler auswählen" : "Erst Corps auswählen"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								{members.length === 0 ? (
									<SelectItem value="__empty" disabled>
										Keine Mitglieder
									</SelectItem>
								) : (
									members.map((m) => (
										<SelectItem key={m.userId} value={m.userId}>
											{m.name ?? m.email} · {m.currentElo} ELO
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1">
							<Label htmlFor="payment">Zahlung</Label>
							<Select
								value={payment}
								onValueChange={(v) => setPayment(v as Payment)}
							>
								<SelectTrigger id="payment" disabled={isPending}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Keine (offline)</SelectItem>
									<SelectItem value="challenger">Herausforderer</SelectItem>
									<SelectItem value="loser">Verlierer</SelectItem>
									<SelectItem value="split">Geteilt</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1">
							<Label htmlFor="quantity">Anzahl</Label>
							<Input
								id="quantity"
								type="number"
								min={1}
								max={20}
								value={quantity}
								onChange={(e) =>
									setQuantity(
										Math.max(
											1,
											Math.min(parseInt(e.target.value, 10) || 1, 20),
										),
									)
								}
								disabled={isPending}
							/>
						</div>
					</div>

					{payment !== "none" && (
						<div className="space-y-1">
							<Label htmlFor="drinkName">Getränk (frei eintragen)</Label>
							<Input
								id="drinkName"
								value={drinkName}
								onChange={(e) => setDrinkName(e.target.value)}
								placeholder="z.B. Bier"
								disabled={isPending}
							/>
							<p className="text-muted-foreground text-xs">
								Nur zur Anzeige — keine automatische Buchung im anderen Corps.
							</p>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isPending}
					>
						Abbrechen
					</Button>
					<Button
						onClick={submit}
						disabled={isPending || !tenantId || !opponentId}
					>
						{isPending ? "Wird gesendet…" : "Herausforderung senden"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
