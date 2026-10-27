import { BottleWine, SearchX } from "lucide-react";
import Link from "next/link";

import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Button } from "~/components/ui/button";
import { EmptyState } from "~/components/ui/empty-state";

// `notFound()` inside the app (e.g. an unknown member profile) keeps the
// sidebar instead of dropping the member out of the app shell.
export default function ProtectedNotFound() {
	return (
		<>
			<SiteHeader title="Nicht gefunden" />
			<div className="p-4 md:p-6">
				<EmptyState
					icon={<SearchX />}
					title="Seite nicht gefunden"
					action={
						<Button asChild variant="outline">
							<Link href="/trinken">
								<BottleWine />
								Zur Getränkekarte
							</Link>
						</Button>
					}
				>
					Was du suchst, gibt es nicht (mehr) oder wurde verschoben.
				</EmptyState>
			</div>
		</>
	);
}
