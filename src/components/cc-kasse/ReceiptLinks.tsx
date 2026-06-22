import { FileText } from "lucide-react";
import type { ReceiptFile } from "~/server/db/schema";

export function ReceiptLinks({
	receipts,
	legacyUrl,
	legacyName,
}: {
	receipts: ReceiptFile[] | null | undefined;
	legacyUrl?: string | null;
	legacyName?: string | null;
}) {
	const list: ReceiptFile[] = receipts?.length
		? receipts
		: legacyUrl
			? [{ url: legacyUrl, name: legacyName ?? "Beleg" }]
			: [];

	if (!list.length) {
		return <span className="text-muted-foreground text-xs">—</span>;
	}

	return (
		<div className="flex flex-col gap-0.5">
			{list.map((r, i) => (
				<a
					key={r.url}
					href={r.url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-primary text-sm hover:underline"
				>
					<FileText className="h-4 w-4 shrink-0" />
					<span className="truncate">
						{list.length > 1 ? `Beleg ${i + 1}` : "ansehen"}
					</span>
				</a>
			))}
		</div>
	);
}
