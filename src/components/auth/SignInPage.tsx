"use client";

import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
} from "lucide-react";
import { signIn } from "next-auth/react";
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

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const message = searchParams.get("message");

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: true,
      callbackUrl,
    });

    setIsLoading(false);

    if (result?.error) {
      setError(
        result.error === "CredentialsSignin"
          ? "Ungültige E-Mail-Adresse oder Passwort."
          : "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut."
      );
      return;
    }

    // IMPORTANT: follow the callback URL so NextAuth can set the cookie/session
    if (result?.url) {
      router.push(result.url);
    } else {
      router.push(callbackUrl);
    }
  };

  const handleProviderSignIn = async (providerId: string) => {
    setIsLoading(true);
    // For OAuth, let NextAuth redirect to the provider (redirect: true)
    if (providerId === "microsoft-entra-id") {
      await signIn("microsoft-entra-id", { callbackUrl, redirect: true });
    } else {
      await signIn("credentials", { email, password, callbackUrl });
    }
    setIsLoading(false);
  };

  const getMessageAlert = () => {
    switch (message) {
      case "account-activated":
        return (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Ihr Konto wurde erfolgreich aktiviert! Sie können sich jetzt
              anmelden.
            </AlertDescription>
          </Alert>
        );
      case "password-reset":
        return (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-4">
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

          <form onSubmit={handleEmailSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-Mail-Adresse</Label>
              <div className="relative">
                <Mail className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
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
                <Lock className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="pl-8 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
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
            <Button
              variant="link"
              size="sm"
              onClick={() => router.push("/auth/forgot-password")}
              className="text-sm"
            >
              Passwort vergessen?
            </Button>
          </div>

          {/* Microsoft OAuth button (optional – you can render dynamically) */}
          <div className="space-y-3 pt-2">
            <Button
              key="microsoft-entra-id"
              variant="outline"
              onClick={() => handleProviderSignIn("microsoft-entra-id")}
              disabled={isLoading}
              className="w-full"
            >
              <svg
                className="w-4 h-4 mr-2"
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
