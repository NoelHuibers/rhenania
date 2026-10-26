"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { ConfirmAction } from "~/components/ui/confirm-action";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createTenantAction } from "~/server/actions/superadmin/tenants";

export function NewTenantForm() {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [slug, setSlug] = useState("");
	const [displayName, setDisplayName] = useState("");
	const [primaryHostname, setPrimaryHostname] = useState("");
	const [firstAdminEmail, setFirstAdminEmail] = useState("");
	const [confirming, setConfirming] = useState(false);

	// Submitting (after the browser's own validation) only asks; the
	// confirm dialog provisions.
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setConfirming(true);
	};

	const provision = () => {
		startTransition(async () => {
			const result = await createTenantAction({
				slug,
				displayName,
				primaryHostname: primaryHostname || null,
				firstAdminEmail: firstAdminEmail || null,
			});
			if (!result.success || !result.data) {
				// Progress is kept: submitting again resumes the run.
				toast.error("Failed to create tenant", {
					description: result.error ?? "Unknown error",
				});
				router.refresh();
				return;
			}
			toast.success(`Tenant '${slug}' created`, {
				description: `DB: ${result.data.dbUrl}`,
			});
			router.push(`/superadmin/tenants/${result.data.tenantId}`);
		});
	};

	return (
		<>
			<ConfirmAction
				open={confirming}
				onOpenChange={setConfirming}
				title={`Provision tenant "${slug}"?`}
				description="This creates a new Turso database and tenant. It is hard to undo."
				confirmLabel="Provision"
				cancelLabel="Cancel"
				onConfirm={provision}
			/>
			<form
				onSubmit={handleSubmit}
				className="max-w-lg space-y-4 rounded-md border bg-card p-6"
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

				<div className="space-y-1">
					<Label htmlFor="primaryHostname">Primary domain (optional)</Label>
					<Input
						id="primaryHostname"
						value={primaryHostname}
						onChange={(e) => setPrimaryHostname(e.target.value.toLowerCase())}
						placeholder="hassia.de"
						disabled={isPending}
					/>
				</div>

				<div className="space-y-1">
					<Label htmlFor="firstAdminEmail">First admin (optional)</Label>
					<Input
						id="firstAdminEmail"
						type="email"
						value={firstAdminEmail}
						onChange={(e) => setFirstAdminEmail(e.target.value)}
						placeholder="senior@hassia.de"
						disabled={isPending}
					/>
					<p className="text-muted-foreground text-xs">
						Must be an existing account (signed in once on any Corps). Gets the
						Admin role in the new tenant.
					</p>
				</div>

				<div className="flex items-center justify-between rounded-md bg-warning-muted p-3 text-sm text-warning-muted-foreground">
					<span>
						This will provision a new Turso DB in the <code>corps</code> group,
						run all migrations, and seed default roles. If a step fails, the
						progress is kept: submit the same slug again to resume.
					</span>
				</div>

				<div className="flex justify-end gap-2">
					<Button type="submit" disabled={isPending}>
						{isPending ? "Provisioning…" : "Create tenant"}
					</Button>
				</div>
			</form>
		</>
	);
}
