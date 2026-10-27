"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ConfirmAction } from "~/components/ui/confirm-action";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	addTenantDomainAction,
	removeTenantDomainAction,
	type SuperadminTenantDetail,
} from "~/server/actions/superadmin/tenants";
import type { SectionProps } from "./tenant-section";

/** Lists a tenant's domains and adds or removes them. */
export function DomainsSection({
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
		<section className="rounded-md border bg-card p-6">
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
						<ConfirmAction
							title={`Remove domain ${d.hostname}?`}
							confirmLabel="Remove"
							cancelLabel="Cancel"
							onConfirm={() => remove(d.id, d.hostname)}
						>
							<Button size="sm" variant="ghost" disabled={disabled}>
								Remove
							</Button>
						</ConfirmAction>
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
