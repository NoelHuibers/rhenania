"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmAction } from "~/components/ui/confirm-action";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
	FEATURE_KEYS,
	FEATURES,
	type FeatureFlags,
	type FeatureKey,
} from "~/lib/features";
import { formatDate } from "~/lib/format";
import {
	type SuperadminTenantDetail,
	setTenantFeatureAction,
	setTenantStatusAction,
	updateTenantDisplayNameAction,
} from "~/server/actions/superadmin/tenants";
import { AuthConfigSection } from "./TenantAuthConfigSection";
import { DomainsSection } from "./TenantDomainsSection";
import type { SectionProps } from "./tenant-section";

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
					{formatDate(data.tenant.createdAt)}
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

			<FeaturesSection
				tenantId={data.tenant.id}
				features={data.features}
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
		<section className="rounded-md border bg-card p-6">
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
		<section className="rounded-md border bg-card p-6">
			<h2 className="mb-4 font-medium">Status</h2>
			<div className="flex items-center gap-3">
				<span className="text-muted-foreground text-sm">
					Current: {current}
				</span>
				<ConfirmAction
					title={isSuspending ? "Suspend tenant?" : "Reactivate tenant?"}
					description={
						isSuspending
							? "Existing users will be locked out until reactivated."
							: undefined
					}
					confirmLabel={isSuspending ? "Suspend" : "Reactivate"}
					cancelLabel="Cancel"
					destructive={isSuspending}
					onConfirm={submit}
				>
					<Button
						variant={isSuspending ? "destructive" : "default"}
						disabled={disabled}
					>
						{isSuspending ? "Suspend" : "Reactivate"}
					</Button>
				</ConfirmAction>
			</div>
		</section>
	);
}

function FeaturesSection({
	tenantId,
	features,
	disabled,
	startTransition,
	onDone,
}: SectionProps & { features: FeatureFlags }) {
	const toggle = (key: FeatureKey, enabled: boolean) => {
		startTransition(async () => {
			const r = await setTenantFeatureAction(tenantId, key, enabled);
			if (r.success) {
				toast.success(
					`${FEATURES[key].label} ${enabled ? "enabled" : "disabled"}`,
				);
				onDone();
			} else {
				toast.error(r.error ?? "Failed to update feature");
			}
		});
	};

	return (
		<section className="rounded-md border bg-card p-6">
			<h2 className="mb-1 font-medium">Features</h2>
			<p className="mb-4 text-muted-foreground text-sm">
				Off by default. Changes reach all server instances within a minute.
			</p>
			<ul className="divide-y">
				{FEATURE_KEYS.map((key) => (
					<li key={key} className="flex items-start justify-between gap-4 py-3">
						<div className="min-w-0">
							<Label htmlFor={`feature-${key}`} className="font-medium">
								{FEATURES[key].label}
							</Label>
							<p className="text-muted-foreground text-sm">
								{FEATURES[key].description}
							</p>
							<p className="font-mono text-muted-foreground text-xs">{key}</p>
						</div>
						<Switch
							id={`feature-${key}`}
							checked={features[key]}
							disabled={disabled}
							onCheckedChange={(checked) => toggle(key, checked)}
						/>
					</li>
				))}
			</ul>
		</section>
	);
}
