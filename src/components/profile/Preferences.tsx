// ~/components/profile/GamificationPreferences.tsx
"use client";

import { Gamepad, Mail, ShieldOff } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
	getEmailNotificationPreferenceAction,
	getEloPreferenceAction,
	setEmailNotificationPreferenceAction,
	setEloPreferenceAction,
} from "~/server/actions/profile/preferences";

export function Preferences() {
	const [eloEnabled, setEloEnabled] = useState<boolean>(true);
	const [emailEnabled, setEmailEnabled] = useState<boolean>(true);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		(async () => {
			const [elo, email] = await Promise.all([
				getEloPreferenceAction(),
				getEmailNotificationPreferenceAction(),
			]);
			setEloEnabled(elo?.enabled ?? true);
			setEmailEnabled(email?.enabled ?? true);
		})();
	}, []);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Gamepad className="h-5 w-5" />
					Privatsphäre & Präferenzen
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="flex items-center justify-between">
					<div>
						<p className="font-medium">Eloranking</p>
						<p className="text-muted-foreground text-sm">
							Teilnahme an Bierjungen & Rangliste
						</p>
					</div>
					<Badge variant={eloEnabled ? "default" : "secondary"}>
						{eloEnabled ? "Aktiv" : "Deaktiviert"}
					</Badge>
				</div>
				<Separator />
				<Button
					variant={eloEnabled ? "outline" : "default"}
					disabled={isPending}
					onClick={() =>
						startTransition(async () => {
							const next = !eloEnabled;
							const ok = await setEloPreferenceAction({ enabled: next });
							if (ok) {
								setEloEnabled(next);
								toast.success(
									next ? "Eloranking aktiviert" : "Eloranking deaktiviert",
								);
							} else {
								toast.error("Aktion fehlgeschlagen");
							}
						})
					}
					className="w-full"
				>
					<ShieldOff className="mr-2 h-4 w-4" />
					{eloEnabled
						? "Eloranking deaktivieren"
						: "Eloranking wieder aktivieren"}
				</Button>

				<Separator />

				<div className="flex items-center justify-between">
					<div>
						<p className="font-medium">E-Mail Benachrichtigungen</p>
						<p className="text-muted-foreground text-sm">
							Rechnung per E-Mail erhalten wenn eine neue Abrechnung erstellt
							wird
						</p>
					</div>
					<Badge variant={emailEnabled ? "default" : "secondary"}>
						{emailEnabled ? "Aktiv" : "Deaktiviert"}
					</Badge>
				</div>
				<Button
					variant={emailEnabled ? "outline" : "default"}
					disabled={isPending}
					onClick={() =>
						startTransition(async () => {
							const next = !emailEnabled;
							const ok = await setEmailNotificationPreferenceAction({
								enabled: next,
							});
							if (ok) {
								setEmailEnabled(next);
								toast.success(
									next
										? "E-Mail Benachrichtigungen aktiviert"
										: "E-Mail Benachrichtigungen deaktiviert",
								);
							} else {
								toast.error("Aktion fehlgeschlagen");
							}
						})
					}
					className="w-full"
				>
					<Mail className="mr-2 h-4 w-4" />
					{emailEnabled
						? "E-Mail Benachrichtigungen deaktivieren"
						: "E-Mail Benachrichtigungen aktivieren"}
				</Button>
			</CardContent>
		</Card>
	);
}
