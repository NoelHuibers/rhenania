"use client";

import {
	AlertCircle,
	CheckCircle,
	Eye,
	EyeOff,
	Lock,
	Mail,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { authClient, signIn } from "~/server/auth/client";

// Error codes Better Auth appends when a Microsoft login is refused.
function oauthErrorMessage(code: string | null): string {
	if (!code) {
		return "";
	}
	if (code === "account_not_linked") {
		return "Zu dieser E-Mail-Adresse gibt es schon ein Konto, das noch nicht Mitglied dieses Corps ist. Melden Sie sich mit E-Mail und Passwort an oder bitten Sie einen Admin dieses Corps, Sie hinzuzufügen.";
	}
	return "Die Anmeldung mit Microsoft ist fehlgeschlagen. Bitte versuchen Sie es erneut.";
}

type SignInPageProps = {
	microsoftProviderId: string | null;
};

export function SignInPage({ microsoftProviderId }: SignInPageProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(() =>
		oauthErrorMessage(searchParams.get("error")),
	);

	const callbackUrl = searchParams.get("callbackUrl") || "/";
	const message = searchParams.get("message");

	const handleEmailSignIn = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		const { error } = await signIn.email({
			email,
			password,
			callbackURL: callbackUrl,
		});

		setIsLoading(false);

		if (error) {
			setError(
				error.message === "Invalid email or password"
					? "Ungültige E-Mail-Adresse oder Passwort."
					: "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
			);
			return;
		}

		router.push(callbackUrl);
	};

	const handleMicrosoftSignIn = async () => {
		if (!microsoftProviderId) {
			return;
		}
		setIsLoading(true);
		await authClient.signIn.oauth2({
			providerId: microsoftProviderId,
			callbackURL: callbackUrl,
			errorCallbackURL: "/auth/signin",
		});
		setIsLoading(false);
	};

	const getMessageAlert = () => {
		switch (message) {
			case "account-activated":
				return (
					<Alert className="border-success/40 bg-success-muted">
						<CheckCircle className="h-4 w-4 text-success" />
						<AlertDescription className="text-success-muted-foreground">
							Ihr Konto wurde erfolgreich aktiviert! Sie können sich jetzt
							anmelden.
						</AlertDescription>
					</Alert>
				);
			case "password-reset":
				return (
					<Alert className="border-success/40 bg-success-muted">
						<CheckCircle className="h-4 w-4 text-success" />
						<AlertDescription className="text-success-muted-foreground">
							Ihr Passwort wurde erfolgreich zurückgesetzt! Sie können sich
							jetzt anmelden.
						</AlertDescription>
					</Alert>
				);
			default:
				return null;
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="pb-4 text-center">
					<CardTitle className="text-2xl">Anmelden</CardTitle>
					<CardDescription>Melden Sie sich mit Ihrem Konto an</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{getMessageAlert()}

					{error && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					{/* Microsoft OAuth button — shown only if the current tenant has
					    Microsoft enabled in tenantAuthConfig. */}
					{microsoftProviderId && (
						<>
							<Button
								variant="outline"
								onClick={handleMicrosoftSignIn}
								disabled={isLoading}
								className="w-full"
							>
								<svg
									className="mr-2 h-4 w-4"
									viewBox="0 0 23 23"
									aria-hidden="true"
								>
									<path fill="#f35325" d="M1 1h10v10H1z" />
									<path fill="#81bc06" d="M12 1h10v10H12z" />
									<path fill="#05a6f0" d="M1 12h10v10H1z" />
									<path fill="#ffba08" d="M12 12h10v10H12z" />
								</svg>
								Mit Microsoft anmelden
							</Button>

							<div className="relative">
								<div className="absolute inset-0 flex items-center">
									<span className="w-full border-t" />
								</div>
								<div className="relative flex justify-center text-xs uppercase">
									<span className="bg-card px-2 text-muted-foreground">
										oder
									</span>
								</div>
							</div>
						</>
					)}

					<form onSubmit={handleEmailSignIn} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="email">E-Mail-Adresse</Label>
							<div className="relative">
								<Mail className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
								<Input
									id="email"
									type="email"
									placeholder="ihre@email.de"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									disabled={isLoading}
									className="pl-8"
									required
								/>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Passwort</Label>
							<div className="relative">
								<Lock className="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									disabled={isLoading}
									className="pr-10 pl-8"
									required
								/>
								<button
									type="button"
									onClick={() => setShowPassword(!showPassword)}
									className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground"
									disabled={isLoading}
									aria-label={
										showPassword ? "Passwort verbergen" : "Passwort anzeigen"
									}
								>
									{showPassword ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
								</button>
							</div>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading || !email || !password}
						>
							{isLoading ? "Wird angemeldet..." : "Mit E-Mail anmelden"}
						</Button>
					</form>

					<div className="text-center">
						<Button asChild variant="link" size="sm" className="text-sm">
							<Link href="/auth/forgot-password">Passwort vergessen?</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
