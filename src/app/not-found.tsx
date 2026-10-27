import { Home, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";

export const metadata: Metadata = {
	title: "Seite nicht gefunden",
	robots: { index: false, follow: false },
};

// Unknown URLs, `notFound()` outside the app, and hosts that belong to no
// tenant (the proxy rewrites those to an unmatched path).
export default function NotFound() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background p-6">
			<div className="w-full max-w-md">
				<h1 className="sr-only">Seite nicht gefunden</h1>
				<EmptyState
					icon={<SearchX />}
					title="Seite nicht gefunden"
					action={
						<Button asChild variant="outline">
							<Link href="/">
								<Home />
								Zur Startseite
							</Link>
						</Button>
					}
				>
					Diese Seite gibt es nicht (mehr). Prüfe die Adresse oder geh zurück
					zur Startseite.
				</EmptyState>
			</div>
		</main>
	);
}
