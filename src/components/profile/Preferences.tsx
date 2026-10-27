// ~/components/profile/GamificationPreferences.tsx
"use client";

import { BellOff, Eye, Gamepad, Mail, ShieldOff } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import {
	setChallengeNotificationPreferenceAction,
	setEloPreferenceAction,
	setEmailNotificationPreferenceAction,
	setPublicProfilePreferenceAction,
} from "~/server/actions/profile/preferences";
import type { ProfilePreferences } from "~/server/lib/preferences";

const ALL_ON: ProfilePreferences = {
	elo: true,
	challengeNotifications: true,
	email: true,
	publicProfile: true,
};

/** The member's switches. `initial` comes from the server (#24); all on while it streams in. */
export function Preferences({
	initial = ALL_ON,
}: {
	initial?: ProfilePreferences;
}) {
	const [eloEnabled, setEloEnabled] = useState<boolean>(initial.elo);
	const [challengeNotifsEnabled, setChallengeNotifsEnabled] = useState<boolean>(
		initial.challengeNotifications,
	);
	const [emailEnabled, setEmailEnabled] = useState<boolean>(initial.email);
	const [publicProfileEnabled, setPublicProfileEnabled] = useState<boolean>(
		initial.publicProfile,
	);
	const [isPending, startTransition] = useTransition();

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
						<p className="font-medium">Öffentliches Profil</p>
						<p className="text-muted-foreground text-sm">
							Achievements, Elo & Trinkstatistiken für andere Mitglieder
							sichtbar
						</p>
					</div>
					<Badge variant={publicProfileEnabled ? "default" : "secondary"}>
						{publicProfileEnabled ? "Aktiv" : "Deaktiviert"}
					</Badge>
				</div>
				<Button
					variant={publicProfileEnabled ? "outline" : "default"}
					disabled={isPending}
					onClick={() =>
						startTransition(async () => {
							const next = !publicProfileEnabled;
							const ok = await setPublicProfilePreferenceAction({
								enabled: next,
							});
							if (ok) {
								setPublicProfileEnabled(next);
								toast.success(
									next
										? "Öffentliches Profil aktiviert"
										: "Öffentliches Profil deaktiviert",
								);
							} else {
								toast.error("Aktion fehlgeschlagen");
							}
						})
					}
					className="w-full"
				>
					<Eye className="mr-2 h-4 w-4" />
					{publicProfileEnabled
						? "Öffentliches Profil deaktivieren"
						: "Öffentliches Profil aktivieren"}
				</Button>

				<Separator />

				<div className="flex items-center justify-between">
					<div>
						<p className="font-medium">Herausforderungs-Benachrichtigungen</p>
						<p className="text-muted-foreground text-sm">
							Banner & Benachrichtigungen bei neuen Herausforderungen anzeigen
						</p>
					</div>
					<Badge variant={challengeNotifsEnabled ? "default" : "secondary"}>
						{challengeNotifsEnabled ? "Aktiv" : "Deaktiviert"}
					</Badge>
				</div>
				<Button
					variant={challengeNotifsEnabled ? "outline" : "default"}
					disabled={isPending}
					onClick={() =>
						startTransition(async () => {
							const next = !challengeNotifsEnabled;
							const ok = await setChallengeNotificationPreferenceAction({
								enabled: next,
							});
							if (ok) {
								setChallengeNotifsEnabled(next);
								toast.success(
									next
										? "Herausforderungs-Benachrichtigungen aktiviert"
										: "Herausforderungs-Benachrichtigungen deaktiviert",
								);
							} else {
								toast.error("Aktion fehlgeschlagen");
							}
						})
					}
					className="w-full"
				>
					<BellOff className="mr-2 h-4 w-4" />
					{challengeNotifsEnabled
						? "Benachrichtigungen deaktivieren"
						: "Benachrichtigungen aktivieren"}
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
