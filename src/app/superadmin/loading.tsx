import { PageSkeleton } from "~/components/ui/page-skeleton";

export default function Loading() {
	return <PageSkeleton label="Seite wird geladen…" className="p-0 md:p-0" />;
}
