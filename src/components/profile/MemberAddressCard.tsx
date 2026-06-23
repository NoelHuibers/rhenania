"use client";

import { Contact } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	getMyMember,
	updateMyAddress,
} from "~/server/actions/members/myMember";
import type { Member } from "~/server/db/schema";

export function MemberAddressCard() {
	const [member, setMember] = useState<Member | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [f, setF] = useState({
		email: "",
		street: "",
		houseNumber: "",
		addressLine2: "",
		postalCode: "",
		city: "",
		country: "Deutschland",
		lettersOptOut: false,
	});
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		(async () => {
			const m = await getMyMember();
			if (m) {
				setMember(m);
				setF({
					email: m.email ?? "",
					street: m.street ?? "",
					houseNumber: m.houseNumber ?? "",
					addressLine2: m.addressLine2 ?? "",
					postalCode: m.postalCode ?? "",
					city: m.city ?? "",
					country: m.country ?? "Deutschland",
					lettersOptOut: m.lettersOptOut,
				});
			}
			setLoaded(true);
		})();
	}, []);

	const set = (k: keyof typeof f, v: string | boolean) =>
		setF((prev) => ({ ...prev, [k]: v }));

	const save = () => {
		startTransition(async () => {
			const res = await updateMyAddress(f);
			if (res.success) toast.success("Adresse gespeichert");
			else toast.error(res.error);
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Contact className="h-5 w-5" />
					Adresse
				</CardTitle>
			</CardHeader>
			<CardContent>
				{loaded && !member ? (
					<p className="text-muted-foreground text-sm">
						Du bist noch nicht im Mitgliederverzeichnis erfasst — wende dich an
						den Senior.
					</p>
				) : (
					<div className="space-y-4">
						<div className="flex items-center gap-2 text-sm">
							<span className="text-muted-foreground">Status:</span>
							<Badge variant="secondary">{member?.status ?? "—"}</Badge>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ma-email">Email</Label>
							<Input
								id="ma-email"
								value={f.email}
								onChange={(e) => set("email", e.target.value)}
								disabled={!loaded || !member || isPending}
							/>
						</div>
						<div className="grid grid-cols-[1fr_90px] gap-2">
							<div className="space-y-2">
								<Label htmlFor="ma-street">Straße</Label>
								<Input
									id="ma-street"
									value={f.street}
									onChange={(e) => set("street", e.target.value)}
									disabled={!loaded || !member || isPending}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="ma-house">Nr.</Label>
								<Input
									id="ma-house"
									value={f.houseNumber}
									onChange={(e) => set("houseNumber", e.target.value)}
									disabled={!loaded || !member || isPending}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="ma-line2">Adresszusatz</Label>
							<Input
								id="ma-line2"
								value={f.addressLine2}
								onChange={(e) => set("addressLine2", e.target.value)}
								placeholder="c/o, Wohnung…"
								disabled={!loaded || !member || isPending}
							/>
						</div>
						<div className="grid grid-cols-[90px_1fr] gap-2">
							<div className="space-y-2">
								<Label htmlFor="ma-plz">PLZ</Label>
								<Input
									id="ma-plz"
									value={f.postalCode}
									onChange={(e) => set("postalCode", e.target.value)}
									disabled={!loaded || !member || isPending}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="ma-city">Ort</Label>
								<Input
									id="ma-city"
									value={f.city}
									onChange={(e) => set("city", e.target.value)}
									disabled={!loaded || !member || isPending}
								/>
							</div>
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								id="ma-opt"
								checked={f.lettersOptOut}
								onCheckedChange={(c) => set("lettersOptOut", c === true)}
								disabled={!loaded || !member || isPending}
							/>
							<Label htmlFor="ma-opt" className="font-normal">
								Nur Email, keine Briefe
							</Label>
						</div>
						<Button
							onClick={save}
							disabled={!loaded || !member || isPending}
							className="w-full"
						>
							Speichern
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
