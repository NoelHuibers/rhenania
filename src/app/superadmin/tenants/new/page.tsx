import Link from "next/link";

import { NewTenantForm } from "~/components/superadmin/NewTenantForm";

export default function NewTenantPage() {
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
			<h1 className="font-semibold text-2xl">Create tenant</h1>
			<NewTenantForm />
		</div>
	);
}
