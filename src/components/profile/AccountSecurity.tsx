"use client";

import { Link, Shield, Unlink } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import {
  changePasswordAction,
  disconnectProviderAction,
  getConnectedAccountsAction,
} from "~/server/actions/profile/auth";

interface ConnectedAccount {
  provider: string;
  connected: boolean;
  icon: string;
  canDisconnect: boolean;
}

export function AccountSecurity() {
  const { data: session, update } = useSession();
  const [isPending, startTransition] = useTransition();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState<
    ConnectedAccount[]
  >([]);
  const [hasLocalPassword, setHasLocalPassword] = useState(false);

  // Verbundene Konten beim Mount prüfen
  useEffect(() => {
    const fetchConnectedAccounts = async () => {
      if (!session?.user?.id) return;

      try {
        const result = await getConnectedAccountsAction();

        if (result.success && result.data) {
          const accounts: ConnectedAccount[] = [
            {
              provider: "Microsoft",
              connected: result.data.accounts.some(
                (acc: any) => acc.provider === "microsoft-entra-id"
              ),
              icon: "🔷",
              canDisconnect:
                result.data.hasPassword || result.data.accounts.length > 1,
            },
          ];

          setConnectedAccounts(accounts);
          setHasLocalPassword(result.data.hasPassword);
        } else {
          toast.error(
            result.error || "Verbundene Konten konnten nicht geladen werden"
          );
        }
      } catch (error) {
        toast.error("Verbundene Konten konnten nicht geladen werden");
      }
    };

    fetchConnectedAccounts();
  }, [session]);

  const handleProviderToggle = (providerName: string) => {
    const account = connectedAccounts.find(
      (acc) => acc.provider === providerName
    );
    if (!account) return;

    startTransition(async () => {
      try {
        if (account.connected) {
          // Anbieter trennen
          const result = await disconnectProviderAction(
            providerName.toLowerCase()
          );

          if (result.success) {
            setConnectedAccounts((prev) =>
              prev.map((acc) =>
                acc.provider === providerName
                  ? { ...acc, connected: false }
                  : acc
              )
            );

            toast.success(`${providerName} getrennt`, {
              description: `Dein ${providerName}-Konto wurde getrennt.`,
            });
          } else {
            toast.error("Trennen fehlgeschlagen", {
              description: result.error || "Konto konnte nicht getrennt werden",
            });
          }
        } else {
          // Zu Anbieter-Login weiterleiten
          window.location.href = `/api/auth/signin/microsoft-entra-id?callbackUrl=${encodeURIComponent(
            window.location.pathname
          )}`;
        }
      } catch (error) {
        toast.error("Fehler", {
          description: "Kontoverknüpfung konnte nicht aktualisiert werden",
        });
      }
    });
  };

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      toast.error("Passwörter stimmen nicht überein", {
        description: "Neues Passwort und Bestätigung stimmen nicht überein.",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Passwort zu kurz", {
        description: "Das Passwort muss mindestens 8 Zeichen lang sein.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await changePasswordAction({
          currentPassword: hasLocalPassword ? currentPassword : undefined,
          newPassword,
        });

        if (result.success) {
          toast.success("Passwort aktualisiert", {
            description: "Dein Passwort wurde erfolgreich geändert.",
          });

          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");

          // Falls erstmals ein Passwort gesetzt wurde
          if (!hasLocalPassword) {
            setHasLocalPassword(true);
            // Verknüpfte Konten neu laden, um canDisconnect zu aktualisieren
            const accountsResult = await getConnectedAccountsAction();
            if (accountsResult.success && accountsResult.data) {
              setConnectedAccounts((prev) =>
                prev.map((acc) => ({
                  ...acc,
                  canDisconnect:
                    accountsResult.data!.hasPassword ||
                    accountsResult.data!.accounts.length > 1,
                }))
              );
            }
          }
        } else {
          toast.error("Aktualisierung des Passworts fehlgeschlagen", {
            description:
              result.error || "Passwort konnte nicht geändert werden",
          });
        }
      } catch (error) {
        toast.error("Fehler", {
          description: "Passwort konnte nicht geändert werden",
        });
      }
    });
  };

  const microsoftAccount = connectedAccounts.find(
    (acc) => acc.provider === "Microsoft"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Konto & Sicherheit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Verknüpfte Anbieter */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Verknüpfte Konten</h3>
          <div className="space-y-3">
            {connectedAccounts.map((account) => (
              <div
                key={account.provider}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{account.icon}</span>
                  <div>
                    <p className="font-medium">{account.provider}</p>
                    <Badge
                      variant={account.connected ? "default" : "secondary"}
                    >
                      {account.connected ? "Verbunden" : "Nicht verbunden"}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleProviderToggle(account.provider)}
                  disabled={
                    isPending || (account.connected && !account.canDisconnect)
                  }
                >
                  {account.connected ? (
                    <>
                      <Unlink className="mr-2 h-4 w-4" />
                      Trennen
                    </>
                  ) : (
                    <>
                      <Link className="mr-2 h-4 w-4" />
                      Verbinden
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {microsoftAccount?.connected && !microsoftAccount.canDisconnect && (
            <p className="text-sm text-muted-foreground mt-2">
              Du kannst dein Microsoft-Konto nicht trennen, da es deine einzige
              Anmeldemethode ist. Richte zuerst ein Passwort ein, um das Trennen
              zu ermöglichen.
            </p>
          )}
        </div>

        <Separator />

        {/* Passwort ändern/festlegen */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {hasLocalPassword ? "Passwort ändern" : "Passwort festlegen"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {hasLocalPassword
              ? "Aktualisiere dein aktuelles Passwort"
              : "Lege ein Passwort fest, um die Anmeldung per E-Mail/Passwort und die Kontowiederherstellung zu aktivieren"}
          </p>
          <div className="space-y-4">
            {hasLocalPassword && (
              <div>
                <Label htmlFor="current-password">Aktuelles Passwort</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
            )}
            <div>
              <Label htmlFor="new-password">
                {hasLocalPassword ? "Neues Passwort" : "Passwort"}
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mindestens 8 Zeichen"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">
                {hasLocalPassword
                  ? "Neues Passwort bestätigen"
                  : "Passwort bestätigen"}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              onClick={handlePasswordChange}
              disabled={
                isPending ||
                (!hasLocalPassword ? false : !currentPassword) ||
                !newPassword ||
                !confirmPassword
              }
              className="w-full sm:w-auto"
            >
              {isPending
                ? "Aktualisiere..."
                : hasLocalPassword
                ? "Passwort aktualisieren"
                : "Passwort festlegen"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
