import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getIdentity } from "~/server/auth";
import { isSuperAdmin } from "~/server/lib/super-admin";

export const metadata: Metadata = {
	title: "Superadmin",
	robots: { index: false, follow: false },
};

// The whole /superadmin subtree depends on the request (auth/session via
// `headers()`), so it can never be statically prerendered. Marking it dynamic
// stops Next from attempting a build-time prerender — which otherwise calls the
// server actions, throws DYNAMIC_SERVER_USAGE, and logs misleading errors.
export const dynamic = "force-dynamic";

export default async function SuperadminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getIdentity();
	if (!session?.user?.id) {
		redirect("/auth/signin?callbackUrl=/superadmin");
	}
	const ok = await isSuperAdmin(session.user.id);
	if (!ok) {
		redirect("/access-denied?required=SuperAdmin&path=/superadmin");
	}

	return (
		<div className="min-h-screen bg-muted/40">
			<header className="border-b bg-card">
				<div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
					<Link href="/superadmin" className="font-semibold text-lg">
						Superadmin
					</Link>
					<div className="text-muted-foreground text-sm">
						{session.user.email}
					</div>
				</div>
			</header>
			<main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
		</div>
	);
}
