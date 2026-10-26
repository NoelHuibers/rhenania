import { Badge } from "~/components/ui/badge";
import { EXPECTED_HEADS, tenantsHealth } from "~/server/lib/health";

/** Per-tenant DB health and schema drift (same data as /api/health/tenants). */
export async function TenantHealthTable() {
	const results = await tenantsHealth();
	return (
		<section className="space-y-2">
			<h2 className="font-semibold text-lg">Status</h2>
			<p className="text-muted-foreground text-sm">
				Expected tenant schema: <code>{EXPECTED_HEADS.tenant.tag}</code>
			</p>
			<div className="overflow-hidden rounded-md border bg-card">
				<table className="w-full text-sm">
					<thead className="border-b bg-muted/40 text-left text-muted-foreground">
						<tr>
							<th className="px-4 py-3 font-medium">Tenant</th>
							<th className="px-4 py-3 font-medium">Database</th>
							<th className="px-4 py-3 font-medium">Schema</th>
							<th className="px-4 py-3 font-medium">Latency</th>
						</tr>
					</thead>
					<tbody>
						{results.map((r) => (
							<tr key={r.slug} className="border-b last:border-0">
								<td className="px-4 py-3 font-mono">{r.slug}</td>
								<td className="px-4 py-3">
									<Badge variant={r.ok ? "secondary" : "destructive"}>
										{r.ok ? "reachable" : "unreachable"}
									</Badge>
								</td>
								<td className="px-4 py-3">
									<Badge variant={r.drift ? "destructive" : "secondary"}>
										{r.drift ? `behind (${r.head ?? "none"})` : "up to date"}
									</Badge>
								</td>
								<td className="px-4 py-3 text-muted-foreground tabular-nums">
									{r.latencyMs === null ? "–" : `${r.latencyMs} ms`}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}
