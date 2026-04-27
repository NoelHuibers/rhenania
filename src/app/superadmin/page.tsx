import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { listTenantsAction } from "~/server/actions/superadmin/tenants";

export default async function SuperadminHomePage() {
	const result = await listTenantsAction();

	if (!result.success || !result.data) {
		return (
			<div className="text-red-600">
				Failed to load tenants: {result.error ?? "unknown"}
			</div>
		);
	}

	const tenants = result.data;

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-2xl">Tenants</h1>
				<Button asChild>
					<Link href="/superadmin/tenants/new">+ New tenant</Link>
				</Button>
			</div>

			{tenants.length === 0 ? (
				<div className="rounded-md border bg-white p-8 text-center text-muted-foreground">
					No tenants yet.
				</div>
			) : (
				<div className="overflow-hidden rounded-md border bg-white">
					<table className="w-full text-sm">
						<thead className="border-b bg-gray-50 text-left text-muted-foreground">
							<tr>
								<th className="px-4 py-3 font-medium">Slug</th>
								<th className="px-4 py-3 font-medium">Display name</th>
								<th className="px-4 py-3 font-medium">Status</th>
								<th className="px-4 py-3 font-medium">Domains</th>
								<th className="px-4 py-3 font-medium">Members</th>
								<th className="px-4 py-3 font-medium">Microsoft</th>
								<th className="px-4 py-3 font-medium">Created</th>
							</tr>
						</thead>
						<tbody>
							{tenants.map((t) => (
								<tr key={t.id} className="border-b last:border-b-0">
									<td className="px-4 py-3">
										<Link
											href={`/superadmin/tenants/${t.id}`}
											className="font-mono text-blue-600 hover:underline"
										>
											{t.slug}
										</Link>
									</td>
									<td className="px-4 py-3">{t.displayName}</td>
									<td className="px-4 py-3">
										<Badge
											variant={
												t.status === "active"
													? "default"
													: t.status === "suspended"
														? "destructive"
														: "secondary"
											}
										>
											{t.status}
										</Badge>
									</td>
									<td className="px-4 py-3">{t.domainCount}</td>
									<td className="px-4 py-3">{t.memberCount}</td>
									<td className="px-4 py-3">
										{t.microsoftEnabled ? "✓" : "—"}
									</td>
									<td className="px-4 py-3 text-muted-foreground">
										{t.createdAt.toLocaleDateString()}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
