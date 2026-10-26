"use client";

import {
	AlertCircle,
	ArrowLeft,
	CheckCircle2,
	Loader2,
	Mail,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { authClient } from "~/server/auth/client";

export function ForgotPassword() {
	const [email, setEmail] = useState("");
	const [submittedEmail, setSubmittedEmail] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		const normalizedEmail = email.trim().toLowerCase();
		if (!normalizedEmail) {
			return;
		}

		setIsLoading(true);
		setError("");

		try {
			const { error: resetError } = await authClient.requestPasswordReset({
				email: normalizedEmail,
				redirectTo: `${window.location.origin}/auth/reset-password`,
			});

			if (resetError) {
				setError(
					"Der Reset-Link konnte gerade nicht versendet werden. Bitte versuchen Sie es später erneut.",
				);
				return;
			}

			setSubmittedEmail(normalizedEmail);
		} catch {
			setError(
				"Der Reset-Link konnte gerade nicht versendet werden. Bitte versuchen Sie es später erneut.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	if (submittedEmail) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-600" />
						<CardTitle>E-Mail prüfen</CardTitle>
						<CardDescription>
							Falls ein Konto für <strong>{submittedEmail}</strong> existiert,
							haben wir einen Link zum Zurücksetzen des Passworts versendet.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-center text-muted-foreground text-sm">
							Der Link ist eine Stunde gültig. Bitte prüfen Sie gegebenenfalls
							auch Ihren Spam-Ordner.
						</p>
						<Button asChild className="w-full">
							<Link href="/auth/signin">Zur Anmeldung</Link>
						</Button>
						<Button
							type="button"
							variant="ghost"
							className="w-full"
							onClick={() => setSubmittedEmail("")}
						>
							Andere E-Mail-Adresse verwenden
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<Mail className="mx-auto mb-4 h-12 w-12 text-primary" />
					<CardTitle>Passwort vergessen?</CardTitle>
					<CardDescription>
						Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen sicheren
						Link zum Zurücksetzen Ihres Passworts.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						<div className="space-y-2">
							<Label htmlFor="email">E-Mail-Adresse</Label>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								placeholder="ihre@email.de"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								disabled={isLoading}
								required
								autoFocus
							/>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading || !email.trim()}
						>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Link wird versendet...
								</>
							) : (
								"Reset-Link senden"
							)}
						</Button>
					</form>

					<Button asChild variant="link" className="mt-4 w-full">
						<Link href="/auth/signin">
							<ArrowLeft className="mr-2 h-4 w-4" />
							Zurück zur Anmeldung
						</Link>
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
