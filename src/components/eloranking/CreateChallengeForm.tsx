"use client";

import { Beer, Search, Users, Wallet } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
	createChallenge,
	type PaymentRule,
} from "~/server/actions/game/challenge";
import { getAllUsersExcept, type User } from "~/server/actions/game/getUsers";
import { getAvailableDrinks, type MenuItem } from "~/server/actions/menu";

interface CreateChallengeFormProps {
	onCreated?: () => void;
}

const PAYMENT_OPTIONS: {
	value: PaymentRule;
	title: string;
	description: string;
}[] = [
	{
		value: "challenger",
		title: "Ich zahle",
		description: "Du übernimmst die Kosten — egal wer gewinnt",
	},
	{
		value: "loser",
		title: "Verlierer zahlt",
		description: "Wer verliert, zahlt beide",
	},
	{
		value: "split",
		title: "50 / 50",
		description: "Jeder zahlt sein eigenes Bier",
	},
];

export function CreateChallengeForm({ onCreated }: CreateChallengeFormProps) {
	const [drinks, setDrinks] = useState<MenuItem[]>([]);
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);

	const [selectedDrinkId, setSelectedDrinkId] = useState<string>("");
	const [selectedOpponent, setSelectedOpponent] = useState<string>("");
	const [payment, setPayment] = useState<PaymentRule>("challenger");
	const [opponentSearch, setOpponentSearch] = useState("");

	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [d, u] = await Promise.all([
					getAvailableDrinks(),
					getAllUsersExcept(),
				]);
				if (cancelled) return;
				setDrinks(d);
				setUsers(u);
			} catch (err) {
				console.error(err);
				if (!cancelled) toast.error("Daten konnten nicht geladen werden");
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const filteredUsers = useMemo(() => {
		if (!opponentSearch.trim()) return users;
		const q = opponentSearch.toLowerCase().trim();
		return users.filter((u) => {
			const name = (u.name || "").toLowerCase();
			const email = (u.email || "").toLowerCase();
			return name.includes(q) || email.includes(q);
		});
	}, [users, opponentSearch]);

	const selectedDrink = drinks.find((d) => d.id === selectedDrinkId);

	const reset = () => {
		setSelectedDrinkId("");
		setSelectedOpponent("");
		setPayment("challenger");
		setOpponentSearch("");
	};

	const canSubmit = !!selectedDrinkId && !!selectedOpponent && !isPending;

	const handleSubmit = () => {
		if (!selectedDrinkId || !selectedOpponent) {
			toast.error("Bitte Getränk und Gegner auswählen");
			return;
		}
		startTransition(async () => {
			const res = await createChallenge({
				opponentId: selectedOpponent,
				drinkId: selectedDrinkId,
				payment,
			});
			if (res.success) {
				toast.success("Herausforderung gesendet!");
				reset();
				onCreated?.();
			} else {
				toast.error(res.error || "Herausforderung fehlgeschlagen");
			}
		});
	};

	return (
		<div className="space-y-4">
			<section className="space-y-2">
				<Label className="flex items-center gap-2 font-medium text-sm">
					<Beer className="h-4 w-4" />
					Getränk
				</Label>
				{loading ? (
					<div className="rounded-lg border p-4 text-center text-muted-foreground text-sm">
						Lade Getränke…
					</div>
				) : drinks.length === 0 ? (
					<div className="rounded-lg border p-4 text-center text-muted-foreground text-sm">
						Keine Getränke verfügbar
					</div>
				) : (
					<div className="max-h-32 overflow-y-auto rounded-md">
						<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
							{drinks.map((d) => {
								const selected = d.id === selectedDrinkId;
								return (
									<button
										key={d.id}
										type="button"
										onClick={() => setSelectedDrinkId(d.id)}
										className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
											selected
												? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
												: "border-border hover:border-orange-300"
										}`}
									>
										<div className="relative h-12 w-12 sm:h-14 sm:w-14">
											<Image
												src={d.picture || "/placeholder.svg"}
												alt={d.name}
												fill
												className="rounded object-cover"
												sizes="56px"
											/>
										</div>
										<div className="w-full truncate text-center font-medium text-[11px] sm:text-xs">
											{d.name}
										</div>
										<div className="text-[10px] text-muted-foreground">
											€{d.price.toFixed(2)}
										</div>
									</button>
								);
							})}
						</div>
					</div>
				)}
			</section>

			<section className="space-y-2">
				<Label className="flex items-center gap-2 font-medium text-sm">
					<Users className="h-4 w-4" />
					Gegner
				</Label>
				<div className="relative">
					<Search className="absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						type="text"
						placeholder="Nach Namen suchen…"
						value={opponentSearch}
						onChange={(e) => setOpponentSearch(e.target.value)}
						className="h-9 pl-9 text-sm"
					/>
				</div>
				<div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
					{loading ? (
						<div className="p-3 text-center text-muted-foreground text-sm">
							Lade Spieler…
						</div>
					) : filteredUsers.length === 0 ? (
						<div className="p-3 text-center text-muted-foreground text-sm">
							{opponentSearch.trim()
								? "Keine Treffer"
								: "Keine Spieler verfügbar"}
						</div>
					) : (
						<RadioGroup
							value={selectedOpponent}
							onValueChange={setSelectedOpponent}
						>
							{filteredUsers.map((u) => (
								<div
									key={u.id}
									className="flex items-center gap-2 rounded-lg p-1.5 transition-colors hover:bg-muted/50"
								>
									<RadioGroupItem
										value={u.id}
										id={`opp-${u.id}`}
										className="h-4 w-4"
									/>
									<Avatar className="h-7 w-7 shrink-0">
										<AvatarImage src={u.image || undefined} />
										<AvatarFallback className="text-[10px]">
											{(u.name || u.email || "")
												.split(" ")
												.map((n) => n[0])
												.join("")
												.toUpperCase()
												.slice(0, 2)}
										</AvatarFallback>
									</Avatar>
									<Label
										htmlFor={`opp-${u.id}`}
										className="min-w-0 flex-1 cursor-pointer truncate text-sm"
									>
										{u.name || u.email || "Unbekannt"}
									</Label>
								</div>
							))}
						</RadioGroup>
					)}
				</div>
			</section>

			<section className="space-y-2">
				<Label className="flex items-center gap-2 font-medium text-sm">
					<Wallet className="h-4 w-4" />
					Einsatz
				</Label>
				<RadioGroup
					value={payment}
					onValueChange={(v) => setPayment(v as PaymentRule)}
					className="space-y-2"
				>
					{PAYMENT_OPTIONS.map((opt) => (
						<div
							key={opt.value}
							className={`flex items-start gap-2 rounded-lg border-2 p-2 transition-colors sm:p-2.5 ${
								payment === opt.value
									? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
									: "border-border hover:border-orange-300"
							}`}
						>
							<RadioGroupItem
								value={opt.value}
								id={`pay-${opt.value}`}
								className="mt-0.5 h-4 w-4 shrink-0"
							/>
							<Label
								htmlFor={`pay-${opt.value}`}
								className="flex-1 cursor-pointer"
							>
								<div className="font-medium text-sm leading-tight">
									{opt.title}
								</div>
								<div className="text-[10px] text-muted-foreground leading-tight sm:text-xs">
									{opt.description}
								</div>
							</Label>
						</div>
					))}
				</RadioGroup>
			</section>

			<Button
				onClick={handleSubmit}
				disabled={!canSubmit}
				className="w-full bg-orange-500 hover:bg-orange-600"
			>
				{isPending
					? "Sende…"
					: selectedDrink
						? `Herausfordern — 2× ${selectedDrink.name}`
						: "Herausfordern"}
			</Button>
		</div>
	);
}
