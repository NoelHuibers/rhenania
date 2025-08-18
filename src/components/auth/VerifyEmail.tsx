"use client";

import { CheckCircle, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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

interface VerifyEmailPageProps {
  verifyEmailAndSetPassword: (
    token: string,
    email: string,
    password: string
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

export default function VerifyEmailPage({
  verifyEmailAndSetPassword,
}: VerifyEmailPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !email) {
      setError("Ungültiger Verifizierungslink. Token oder E-Mail fehlt.");
    }
  }, [token, email]);

  const validatePassword = (password: string) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return {
      isValid:
        password.length >= minLength &&
        hasUpperCase &&
        hasLowerCase &&
        hasNumbers,
      requirements: {
        minLength: password.length >= minLength,
        hasUpperCase,
        hasLowerCase,
        hasNumbers,
        hasSpecial,
      },
    };
  };

  const passwordValidation = validatePassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token || !email) {
      setError("Ungültiger Verifizierungslink.");
      return;
    }

    if (!passwordValidation.isValid) {
      setError("Das Passwort erfüllt nicht alle Anforderungen.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await verifyEmailAndSetPassword(token, email, password);

      if (result.success) {
        toast.success("Konto erfolgreich aktiviert!", {
          description:
            "Sie können sich jetzt mit Ihrer E-Mail und Ihrem Passwort anmelden.",
        });
        router.push("/auth/signin?message=account-activated");
      } else {
        setError(result.error || "Ein Fehler ist aufgetreten.");
      }
    } catch (error) {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <CardTitle>Ungültiger Link</CardTitle>
            <CardDescription>
              Der Verifizierungslink ist ungültig oder abgelaufen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push("/auth/signin")}
              className="w-full"
            >
              Zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <CardTitle>Konto aktivieren</CardTitle>
          <CardDescription>
            Erstellen Sie ein Passwort für <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Password Requirements */}
              {password && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-700">
                    Passwort-Anforderungen:
                  </p>
                  <div className="grid grid-cols-1 gap-1">
                    <div
                      className={`flex items-center gap-2 ${
                        passwordValidation.requirements.minLength
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {passwordValidation.requirements.minLength ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="text-xs">Mindestens 8 Zeichen</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 ${
                        passwordValidation.requirements.hasUpperCase
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {passwordValidation.requirements.hasUpperCase ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="text-xs">Großbuchstaben (A-Z)</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 ${
                        passwordValidation.requirements.hasLowerCase
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {passwordValidation.requirements.hasLowerCase ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="text-xs">Kleinbuchstaben (a-z)</span>
                    </div>
                    <div
                      className={`flex items-center gap-2 ${
                        passwordValidation.requirements.hasNumbers
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {passwordValidation.requirements.hasNumbers ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span className="text-xs">Zahlen (0-9)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {confirmPassword && password !== confirmPassword && (
                <p className="text-sm text-red-600 flex items-center gap-2">
                  <XCircle className="h-3 w-3" />
                  Die Passwörter stimmen nicht überein
                </p>
              )}

              {confirmPassword &&
                password === confirmPassword &&
                confirmPassword.length > 0 && (
                  <p className="text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle className="h-3 w-3" />
                    Passwörter stimmen überein
                  </p>
                )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                !passwordValidation.isValid ||
                password !== confirmPassword
              }
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Konto wird aktiviert...
                </>
              ) : (
                "Konto aktivieren"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Button
              variant="link"
              onClick={() => router.push("/auth/signin")}
              className="text-sm"
            >
              Zurück zur Anmeldung
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
