"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	abandonTenantProvisioningAction,
	createTenantAction,
} from "~/server/actions/superadmin/tenants";
import type { UnfinishedProvisioning } from "~/server/lib/tenant-provisioning";

/** Provisioning runs that stopped before the tenant became active. */
export function ProvisioningRuns({ runs }: { runs: UnfinishedProvisioning[] }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	if (runs.length === 0) {
		return null;
	}

	const resume = (run: UnfinishedProvisioning) =>
		startTransition(async () => {
			const result = await createTenantAction({
				slug: run.slug,
				displayName: run.displayName,
			});
			if (result.success) {
				toast.success(`Tenant '${run.slug}' created`);
			} else {
				toast.error("Provisioning stopped again", {
					description: result.error ?? "Unknown error",
				});
			}
			router.refresh();
		});

	const abandon = (run: UnfinishedProvisioning) => {
		if (
			!confirm(
				`Abandon '${run.slug}'? This deletes its Turso DB and any rows created so far.`,
			)
		) {
			return;
		}
		startTransition(async () => {
			const result = await abandonTenantProvisioningAction(run.slug);
			if (result.success) {
				toast.success(`Provisioning of '${run.slug}' abandoned`);
			} else {
				toast.error("Could not abandon", {
					description: result.error ?? "Unknown error",
				});
			}
			router.refresh();
		});
	};

	return (
		<section className="space-y-2">
			<h2 className="font-semibold text-lg">Unfinished provisioning</h2>
			<div className="overflow-hidden rounded-md border bg-white">
				<table className="w-full text-sm">
					<thead className="border-b bg-gray-50 text-left text-muted-foreground">
						<tr>
							<th className="px-4 py-3 font-medium">Slug</th>
							<th className="px-4 py-3 font-medium">Last completed step</th>
							<th className="px-4 py-3 font-medium">Error</th>
							<th className="px-4 py-3 font-medium">Attempts</th>
							<th className="px-4 py-3 font-medium" />
						</tr>
					</thead>
					<tbody>
						{runs.map((run) => (
							<tr key={run.slug} className="border-b last:border-0">
								<td className="px-4 py-3 font-mono">{run.slug}</td>
								<td className="px-4 py-3">
									<Badge variant="secondary">
										{run.running ? "running" : run.step}
									</Badge>
								</td>
								<td className="px-4 py-3 text-muted-foreground">
									{run.lastError ?? "–"}
								</td>
								<td className="px-4 py-3 tabular-nums">{run.attempts}</td>
								<td className="space-x-2 whitespace-nowrap px-4 py-3 text-right">
									<Button
										size="sm"
										disabled={isPending || run.running}
										onClick={() => resume(run)}
									>
										Resume
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={isPending || run.running}
										onClick={() => abandon(run)}
									>
										Abandon
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
