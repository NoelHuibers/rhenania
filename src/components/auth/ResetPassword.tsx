"use client";

import {
	AlertCircle,
	CheckCircle2,
	Eye,
	EyeOff,
	Loader2,
	XCircle,
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
import { authClient } from "~/server/auth/client";

function validatePassword(password: string) {
	const requirements = {
		minLength: password.length >= 8,
		hasUpperCase: /[A-Z]/.test(password),
		hasLowerCase: /[a-z]/.test(password),
		hasNumber: /\d/.test(password),
	};

	return {
		requirements,
		isValid: Object.values(requirements).every(Boolean),
	};
}

export function ResetPassword() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token");
	const linkError = searchParams.get("error");

	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [showConfirmPassword, setShowConfirmPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState("");

	const passwordValidation = validatePassword(password);
	const passwordsMatch =
		confirmPassword.length > 0 && password === confirmPassword;
	const invalidLink = !token || linkError === "INVALID_TOKEN";

	const handleSubmit = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!token || !passwordValidation.isValid || !passwordsMatch) {
			return;
		}

		setIsLoading(true);
		setError("");

		try {
			const { error: resetError } = await authClient.resetPassword({
				newPassword: password,
				token,
			});

			if (resetError) {
				setError(
					resetError.code === "INVALID_TOKEN"
						? "Der Reset-Link ist ungültig, abgelaufen oder wurde bereits verwendet."
						: "Das Passwort konnte nicht zurückgesetzt werden. Bitte versuchen Sie es erneut.",
				);
				return;
			}

			router.replace("/auth/signin?message=password-reset");
		} catch {
			setError(
				"Das Passwort konnte nicht zurückgesetzt werden. Bitte versuchen Sie es erneut.",
			);
		} finally {
			setIsLoading(false);
		}
	};

	if (invalidLink) {
		return (
			<div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
				<Card className="w-full max-w-md">
					<CardHeader className="text-center">
						<XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
						<CardTitle>Reset-Link ungültig</CardTitle>
						<CardDescription>
							Der Link ist abgelaufen, wurde bereits verwendet oder ist
							unvollständig.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Button asChild className="w-full">
							<Link href="/auth/forgot-password">
								Neuen Reset-Link anfordern
							</Link>
						</Button>
						<Button asChild variant="ghost" className="w-full">
							<Link href="/auth/signin">Zur Anmeldung</Link>
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
					<CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-primary" />
					<CardTitle>Neues Passwort festlegen</CardTitle>
					<CardDescription>
						Wählen Sie ein neues Passwort für Ihr Konto.
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
							<Label htmlFor="password">Neues Passwort</Label>
							<div className="relative">
								<Input
									id="password"
									type={showPassword ? "text" : "password"}
									autoComplete="new-password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
									disabled={isLoading}
									className="pr-10"
									required
									autoFocus
								/>
								<button
									type="button"
									onClick={() => setShowPassword((value) => !value)}
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

							{password && (
								<div className="space-y-1 text-xs">
									<p className="font-medium text-muted-foreground">
										Das Passwort benötigt:
									</p>
									<Requirement
										fulfilled={passwordValidation.requirements.minLength}
										label="Mindestens 8 Zeichen"
									/>
									<Requirement
										fulfilled={passwordValidation.requirements.hasUpperCase}
										label="Einen Großbuchstaben"
									/>
									<Requirement
										fulfilled={passwordValidation.requirements.hasLowerCase}
										label="Einen Kleinbuchstaben"
									/>
									<Requirement
										fulfilled={passwordValidation.requirements.hasNumber}
										label="Eine Zahl"
									/>
								</div>
							)}
						</div>

						<div className="space-y-2">
							<Label htmlFor="confirmPassword">Passwort bestätigen</Label>
							<div className="relative">
								<Input
									id="confirmPassword"
									type={showConfirmPassword ? "text" : "password"}
									autoComplete="new-password"
									value={confirmPassword}
									onChange={(event) => setConfirmPassword(event.target.value)}
									disabled={isLoading}
									className="pr-10"
									required
								/>
								<button
									type="button"
									onClick={() => setShowConfirmPassword((value) => !value)}
									className="absolute top-2.5 right-2 text-muted-foreground hover:text-foreground"
									disabled={isLoading}
									aria-label={
										showConfirmPassword
											? "Passwortbestätigung verbergen"
											: "Passwortbestätigung anzeigen"
									}
								>
									{showConfirmPassword ? (
										<EyeOff className="h-4 w-4" />
									) : (
										<Eye className="h-4 w-4" />
									)}
								</button>
							</div>

							{confirmPassword && (
								<p
									className={`flex items-center gap-1 text-xs ${
										passwordsMatch ? "text-success" : "text-destructive"
									}`}
								>
									{passwordsMatch ? (
										<CheckCircle2 className="h-3 w-3" />
									) : (
										<XCircle className="h-3 w-3" />
									)}
									{passwordsMatch
										? "Passwörter stimmen überein"
										: "Passwörter stimmen nicht überein"}
								</p>
							)}
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={
								isLoading || !passwordValidation.isValid || !passwordsMatch
							}
						>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Passwort wird gespeichert...
								</>
							) : (
								"Passwort speichern"
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

function Requirement({
	fulfilled,
	label,
}: {
	fulfilled: boolean;
	label: string;
}) {
	return (
		<p
			className={`flex items-center gap-1 ${
				fulfilled ? "text-success" : "text-destructive"
			}`}
		>
			{fulfilled ? (
				<CheckCircle2 className="h-3 w-3" />
			) : (
				<XCircle className="h-3 w-3" />
			)}
			{label}
		</p>
	);
}
