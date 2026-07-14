"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type AuthConfigPatch,
	addTenantDomainAction,
	removeTenantDomainAction,
	type SuperadminTenantDetail,
	setTenantStatusAction,
	updateTenantAuthConfigAction,
	updateTenantDisplayNameAction,
} from "~/server/actions/superadmin/tenants";

export function TenantDetail({ data }: { data: SuperadminTenantDetail }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const refresh = () => router.refresh();

	return (
		<div className="space-y-8">
			<header className="space-y-2">
				<div className="flex items-center gap-3">
					<h1 className="font-semibold text-2xl">{data.tenant.displayName}</h1>
					<Badge
						variant={
							data.tenant.status === "active"
								? "default"
								: data.tenant.status === "suspended"
									? "destructive"
									: "secondary"
						}
					>
						{data.tenant.status}
					</Badge>
				</div>
				<div className="text-muted-foreground text-sm">
					<span className="font-mono">{data.tenant.slug}</span> ·{" "}
					{data.memberCount} members · created{" "}
					{data.tenant.createdAt.toLocaleDateString()}
				</div>
				<div className="text-muted-foreground text-xs">
					DB: <span className="font-mono">{data.tenant.dbUrl}</span>
				</div>
			</header>

			<DisplayNameSection
				tenantId={data.tenant.id}
				initial={data.tenant.displayName}
				disabled={isPending}
				startTransition={startTransition}
				onDone={refresh}
			/>

			<StatusSection
				tenantId={data.tenant.id}
				current={data.tenant.status}
				disabled={isPending}
				startTransition={startTransition}
				onDone={refresh}
			/>

			<DomainsSection
				tenantId={data.tenant.id}
				domains={data.domains}
				disabled={isPending}
				startTransition={startTransition}
				onDone={refresh}
			/>

			<AuthConfigSection
				tenantId={data.tenant.id}
				slug={data.tenant.slug}
				initial={data.authConfig}
				disabled={isPending}
				startTransition={startTransition}
				onDone={refresh}
			/>
		</div>
	);
}

type SectionProps = {
	tenantId: string;
	disabled: boolean;
	startTransition: React.TransitionStartFunction;
	onDone: () => void;
};

function DisplayNameSection({
	tenantId,
	initial,
	disabled,
	startTransition,
	onDone,
}: SectionProps & { initial: string }) {
	const [name, setName] = useState(initial);

	const submit = () => {
		startTransition(async () => {
			const r = await updateTenantDisplayNameAction(tenantId, name);
			if (r.success) {
				toast.success("Display name updated");
				onDone();
			} else {
				toast.error(r.error ?? "Failed to update");
			}
		});
	};

	return (
		<section className="rounded-md border bg-white p-6">
			<h2 className="mb-4 font-medium">Display name</h2>
			<div className="flex max-w-lg gap-2">
				<Input
					value={name}
					onChange={(e) => setName(e.target.value)}
					disabled={disabled}
				/>
				<Button onClick={submit} disabled={disabled || name === initial}>
					Save
				</Button>
			</div>
		</section>
	);
}

function StatusSection({
	tenantId,
	current,
	disabled,
	startTransition,
	onDone,
}: SectionProps & { current: "active" | "suspended" | "pending" }) {
	const next = current === "active" ? "suspended" : "active";
	const isSuspending = next === "suspended";

	const submit = () => {
		const msg = isSuspending
			? `Suspend tenant? Existing users will be locked out until reactivated.`
			: `Reactivate tenant?`;
		if (!confirm(msg)) return;
		startTransition(async () => {
			const r = await setTenantStatusAction(tenantId, next);
			if (r.success) {
				toast.success(`Tenant ${next}`);
				onDone();
			} else {
				toast.error(r.error ?? "Failed to update status");
			}
		});
	};

	return (
		<section className="rounded-md border bg-white p-6">
			<h2 className="mb-4 font-medium">Status</h2>
			<div className="flex items-center gap-3">
				<span className="text-muted-foreground text-sm">
					Current: {current}
				</span>
				<Button
					variant={isSuspending ? "destructive" : "default"}
					onClick={submit}
					disabled={disabled}
				>
					{isSuspending ? "Suspend" : "Reactivate"}
				</Button>
			</div>
		</section>
	);
}

function DomainsSection({
	tenantId,
	domains,
	disabled,
	startTransition,
	onDone,
}: SectionProps & {
	domains: SuperadminTenantDetail["domains"];
}) {
	const [hostname, setHostname] = useState("");
	const [isPrimary, setIsPrimary] = useState(false);

	const add = () => {
		startTransition(async () => {
			const r = await addTenantDomainAction(tenantId, hostname, {
				isPrimary,
			});
			if (r.success) {
				toast.success(`Added ${hostname}`);
				setHostname("");
				setIsPrimary(false);
				onDone();
			} else {
				toast.error(r.error ?? "Failed to add domain");
			}
		});
	};

	const remove = (id: string, host: string) => {
		if (!confirm(`Remove domain ${host}?`)) return;
		startTransition(async () => {
			const r = await removeTenantDomainAction(tenantId, id);
			if (r.success) {
				toast.success(`Removed ${host}`);
				onDone();
			} else {
				toast.error(r.error ?? "Failed to remove domain");
			}
		});
	};

	return (
		<section className="rounded-md border bg-white p-6">
			<h2 className="mb-4 font-medium">Domains</h2>
			<ul className="mb-4 divide-y rounded border">
				{domains.length === 0 && (
					<li className="px-4 py-3 text-muted-foreground text-sm">
						No domains yet. Add at least one.
					</li>
				)}
				{domains.map((d) => (
					<li
						key={d.id}
						className="flex items-center justify-between px-4 py-3"
					>
						<div className="flex items-center gap-2 font-mono text-sm">
							{d.hostname}
							{d.isPrimary && <Badge variant="default">primary</Badge>}
							{!d.isCustom && <Badge variant="secondary">dev</Badge>}
						</div>
						<Button
							size="sm"
							variant="ghost"
							onClick={() => remove(d.id, d.hostname)}
							disabled={disabled}
						>
							Remove
						</Button>
					</li>
				))}
			</ul>
			<div className="flex max-w-lg flex-col gap-2 sm:flex-row sm:items-end">
				<div className="flex-1 space-y-1">
					<Label htmlFor="new-host">Hostname</Label>
					<Input
						id="new-host"
						value={hostname}
						onChange={(e) => setHostname(e.target.value.toLowerCase())}
						placeholder="hassia.de"
						disabled={disabled}
					/>
				</div>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						checked={isPrimary}
						onChange={(e) => setIsPrimary(e.target.checked)}
						disabled={disabled}
					/>
					Primary
				</label>
				<Button onClick={add} disabled={disabled || !hostname}>
					Add
				</Button>
			</div>
		</section>
	);
}

function AuthConfigSection({
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
						"Restart the dev/prod server for the change to take effect.",
				});
				setClientSecret("");
				onDone();
			} else {
				toast.error(r.error ?? "Failed to update auth config");
			}
		});
	};

	return (
		<section className="rounded-md border bg-white p-6">
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

				<div className="rounded-md bg-amber-50 p-3 text-amber-900 text-xs">
					Auth provider configs are loaded at server start. Restart the app
					after changing these for them to take effect.
				</div>
			</div>
		</section>
	);
}
