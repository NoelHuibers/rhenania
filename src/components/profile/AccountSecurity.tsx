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
} from "~/server/actions/auth";

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

  // Check user's connected accounts on component mount
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
          toast.error(result.error || "Failed to fetch connected accounts");
        }
      } catch (error) {
        toast.error("Failed to fetch connected accounts");
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
          // Disconnect provider
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

            toast.success(`${providerName} disconnected`, {
              description: `Your ${providerName} account has been disconnected.`,
            });
          } else {
            toast.error("Failed to disconnect", {
              description: result.error || "Failed to disconnect account",
            });
          }
        } else {
          // Redirect to connect provider
          window.location.href = `/api/auth/signin/microsoft-entra-id?callbackUrl=${encodeURIComponent(
            window.location.pathname
          )}`;
        }
      } catch (error) {
        toast.error("Error", {
          description: "Failed to update account connection",
        });
      }
    });
  };

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      toast.error("Password mismatch", {
        description: "New password and confirmation don't match.",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password too short", {
        description: "Password must be at least 8 characters long.",
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
          toast.success("Password updated", {
            description: "Your password has been successfully changed.",
          });

          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");

          // Update hasLocalPassword state if this was setting password for first time
          if (!hasLocalPassword) {
            setHasLocalPassword(true);
            // Refresh connected accounts to update canDisconnect status
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
          toast.error("Failed to update password", {
            description: result.error || "Failed to change password",
          });
        }
      } catch (error) {
        toast.error("Error", {
          description: "Failed to change password",
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
          Account & Security
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connected Providers */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Connected Accounts</h3>
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
                      {account.connected ? "Connected" : "Not connected"}
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
                      Disconnect
                    </>
                  ) : (
                    <>
                      <Link className="mr-2 h-4 w-4" />
                      Connect
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>

          {microsoftAccount?.connected && !microsoftAccount.canDisconnect && (
            <p className="text-sm text-muted-foreground mt-2">
              You cannot disconnect your Microsoft account as it's your only
              login method. Set up a password first to enable disconnection.
            </p>
          )}
        </div>

        <Separator />

        {/* Change Password */}
        <div>
          <h3 className="text-lg font-semibold mb-4">
            {hasLocalPassword ? "Change Password" : "Set Password"}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {hasLocalPassword
              ? "Update your current password"
              : "Set a password to enable email/password login and account recovery"}
          </p>
          <div className="space-y-4">
            {hasLocalPassword && (
              <div>
                <Label htmlFor="current-password">Current Password</Label>
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
                {hasLocalPassword ? "New Password" : "Password"}
              </Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">
                Confirm {hasLocalPassword ? "New " : ""}Password
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
                ? "Updating..."
                : hasLocalPassword
                ? "Update Password"
                : "Set Password"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
