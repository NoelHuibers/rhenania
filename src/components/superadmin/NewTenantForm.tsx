"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createTenantAction } from "~/server/actions/superadmin/tenants";

export function NewTenantForm() {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [slug, setSlug] = useState("");
	const [displayName, setDisplayName] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (
			!confirm(
				`Provision a new Turso DB and tenant for "${slug}"? This is hard to undo.`,
			)
		) {
			return;
		}
		startTransition(async () => {
			const result = await createTenantAction({ slug, displayName });
			if (!result.success || !result.data) {
				toast.error("Failed to create tenant", {
					description: result.error ?? "Unknown error",
				});
				return;
			}
			toast.success(`Tenant '${slug}' created`, {
				description: `DB: ${result.data.dbUrl}`,
			});
			router.push(`/superadmin/tenants/${result.data.tenantId}`);
		});
	};

	return (
		<form
			onSubmit={handleSubmit}
			className="max-w-lg space-y-4 rounded-md border bg-white p-6"
		>
			<div className="space-y-1">
				<Label htmlFor="slug">Slug</Label>
				<Input
					id="slug"
					value={slug}
					onChange={(e) => setSlug(e.target.value.toLowerCase())}
					placeholder="hassia"
					pattern="[a-z][a-z0-9-]{2,30}"
					required
					disabled={isPending}
				/>
				<p className="text-muted-foreground text-xs">
					Lowercase letters, digits, dashes. 3–31 chars, must start with a
					letter. Becomes part of the Turso DB name (
					<code>corps-&lt;slug&gt;</code>) and the Microsoft providerId (
					<code>microsoft-&lt;slug&gt;</code>).
				</p>
			</div>

			<div className="space-y-1">
				<Label htmlFor="displayName">Display name</Label>
				<Input
					id="displayName"
					value={displayName}
					onChange={(e) => setDisplayName(e.target.value)}
					placeholder="Corps Hassia Bonn"
					required
					disabled={isPending}
				/>
			</div>

			<div className="flex items-center justify-between rounded-md bg-amber-50 p-3 text-amber-900 text-sm">
				<span>
					This will provision a new Turso DB in the <code>corps</code> group,
					run all migrations, and seed default roles.
				</span>
			</div>

			<div className="flex justify-end gap-2">
				<Button type="submit" disabled={isPending}>
					{isPending ? "Provisioning…" : "Create tenant"}
				</Button>
			</div>
		</form>
	);
}
