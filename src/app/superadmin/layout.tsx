import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { isSuperAdmin } from "~/server/lib/super-admin";

export const metadata = {
	title: "Superadmin",
};

export default async function SuperadminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin?callbackUrl=/superadmin");
	}
	const ok = await isSuperAdmin(session.user.id);
	if (!ok) {
		redirect("/access-denied?required=SuperAdmin&path=/superadmin");
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<header className="border-b bg-white">
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
