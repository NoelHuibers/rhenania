import Link from "next/link";
import { notFound } from "next/navigation";

import { TenantDetail } from "~/components/superadmin/TenantDetail";
import { getTenantDetailAction } from "~/server/actions/superadmin/tenants";

export default async function TenantDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const result = await getTenantDetailAction(id);
	if (!result.ok) {
		if (result.code === "NOT_FOUND") {
			notFound();
		}
		return (
			<div className="text-destructive">Failed to load: {result.error}</div>
		);
	}

	return (
		<div className="space-y-6">
			<div>
				<Link
					href="/superadmin"
					className="text-muted-foreground text-sm hover:underline"
				>
					← Back to tenants
				</Link>
			</div>
			<TenantDetail data={result.data} />
		</div>
	);
}
