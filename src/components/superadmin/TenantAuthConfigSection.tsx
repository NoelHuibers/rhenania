"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type AuthConfigPatch,
	type SuperadminTenantDetail,
	updateTenantAuthConfigAction,
} from "~/server/actions/superadmin/tenants";
import type { SectionProps } from "./tenant-section";

/** Edits a tenant's Microsoft (Azure AD) sign-in and mail sender config. */
export function AuthConfigSection({
	tenantId,
	slug,
	initial,
	disabled,
	startTransition,
	onDone,
}: SectionProps & {
	slug: string;
	initial: SuperadminTenantDetail["authConfig"];
}) {
	const [microsoftEnabled, setMicrosoftEnabled] = useState(
		initial?.microsoftEnabled ?? false,
	);
	const [clientId, setClientId] = useState(initial?.azureClientId ?? "");
	const [clientSecret, setClientSecret] = useState("");
	const [tenantIdAzure, setTenantIdAzure] = useState(
		initial?.azureTenantId ?? "",
	);
	const [mailSender, setMailSender] = useState(initial?.mailSenderEmail ?? "");

	const submit = () => {
		const patch: AuthConfigPatch = {
			microsoftEnabled,
			azureClientId: clientId.trim() || null,
			azureTenantId: tenantIdAzure.trim() || null,
			mailSenderEmail: mailSender.trim() || null,
		};
		// Only send the secret if user typed a new one (avoid overwriting with "")
		if (clientSecret.trim() !== "") {
			patch.azureClientSecret = clientSecret.trim();
		}
		startTransition(async () => {
			const r = await updateTenantAuthConfigAction(tenantId, patch);
			if (r.success) {
				toast.success("Auth config updated", {
					description:
						"Takes effect on every server within a few seconds, no restart needed.",
				});
				setClientSecret("");
				onDone();
			} else {
				toast.error(r.error ?? "Failed to update auth config");
			}
		});
	};

	return (
		<section className="rounded-md border bg-card p-6">
			<h2 className="mb-1 font-medium">Microsoft (Azure AD) sign-in</h2>
			<p className="mb-4 text-muted-foreground text-xs">
				Provider id: <code>microsoft-{slug}</code>. Register this redirect URI
				in the Azure app:{" "}
				<code>
					https://&lt;tenant-host&gt;/api/auth/oauth2/callback/microsoft-{slug}
				</code>
			</p>

			<div className="max-w-lg space-y-3">
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={microsoftEnabled}
						onChange={(e) => setMicrosoftEnabled(e.target.checked)}
						disabled={disabled}
					/>
					Enable Microsoft sign-in
				</label>

				<div className="space-y-1">
					<Label htmlFor="client-id">Azure client ID</Label>
					<Input
						id="client-id"
						value={clientId}
						onChange={(e) => setClientId(e.target.value)}
						disabled={disabled}
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor="client-secret">
						Azure client secret{" "}
						{initial?.hasAzureSecret && (
							<span className="text-muted-foreground text-xs">
								(stored — leave blank to keep)
							</span>
						)}
					</Label>
					<Input
						id="client-secret"
						type="password"
						value={clientSecret}
						onChange={(e) => setClientSecret(e.target.value)}
						placeholder={initial?.hasAzureSecret ? "••••••••" : ""}
						disabled={disabled}
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor="tenant-azure">Azure tenant ID</Label>
					<Input
						id="tenant-azure"
						value={tenantIdAzure}
						onChange={(e) => setTenantIdAzure(e.target.value)}
						disabled={disabled}
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor="mail-sender">Mail sender (Microsoft Graph)</Label>
					<Input
						id="mail-sender"
						type="email"
						value={mailSender}
						onChange={(e) => setMailSender(e.target.value)}
						placeholder="noreply@corps-domain.de"
						disabled={disabled}
					/>
					<p className="text-muted-foreground text-xs">
						Mailbox the app sends as via Graph <code>sendMail</code>. Requires
						the <code>Mail.Send</code> APPLICATION permission (admin-consented)
						on the Azure app above. Empty → legacy Gmail transport.
					</p>
				</div>

				<Button onClick={submit} disabled={disabled}>
					Save auth config
				</Button>

				<div className="rounded-md bg-muted p-3 text-muted-foreground text-xs">
					Changes apply to sign-in on every server within a few seconds; no
					restart or redeploy needed.
				</div>
			</div>
		</section>
	);
}
