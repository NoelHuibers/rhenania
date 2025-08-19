"use client";

import { Link, Shield, Unlink } from "lucide-react";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";

export function AccountSecurity() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [providers, setProviders] = useState([
    { name: "Microsoft", connected: true, icon: "🔷" },
    { name: "Google", connected: false, icon: "🔴" },
    { name: "GitHub", connected: true, icon: "⚫" },
  ]);

  const handleProviderToggle = (providerName: string) => {
    setProviders((prev) =>
      prev.map((provider) =>
        provider.name === providerName
          ? { ...provider, connected: !provider.connected }
          : provider
      )
    );

    const provider = providers.find((p) => p.name === providerName);
    // toast({
    //   title: `${providerName} ${
    //     provider?.connected ? "disconnected" : "connected"
    //   }`,
    //   description: `Your ${providerName} account has been ${
    //     provider?.connected ? "disconnected from" : "connected to"
    //   } your profile.`,
    // });
  };

  const handlePasswordChange = () => {
    if (newPassword !== confirmPassword) {
      // toast({
      //   title: "Password mismatch",
      //   description: "New password and confirmation don't match.",
      //   variant: "destructive",
      // });
      return;
    }

    if (newPassword.length < 8) {
      // toast({
      //   title: "Password too short",
      //   description: "Password must be at least 8 characters long.",
      //   variant: "destructive",
      // });
      return;
    }

    // toast({
    //   title: "Password updated",
    //   description: "Your password has been successfully changed.",
    // });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

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
            {providers.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{provider.icon}</span>
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <Badge
                      variant={provider.connected ? "default" : "secondary"}
                    >
                      {provider.connected ? "Connected" : "Not connected"}
                    </Badge>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleProviderToggle(provider.name)}
                >
                  {provider.connected ? (
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
        </div>

        <Separator />

        {/* Change Password */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Change Password</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button
              onClick={handlePasswordChange}
              disabled={!currentPassword || !newPassword || !confirmPassword}
              className="w-full sm:w-auto"
            >
              Update Password
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
