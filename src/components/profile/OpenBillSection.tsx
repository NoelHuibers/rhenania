import { auth } from "~/server/auth";
import { loadOpenBill } from "~/server/loaders/open-bill";
import { OpenBillCard } from "./OpenBillCard";

/** The member's open bill for the top of the profile; nothing when paid up. */
export async function OpenBillSection({ className }: { className?: string }) {
	const session = await auth();
	const bill = session
		? await loadOpenBill(session).catch((error) => {
				console.error("Error loading the open bill:", error);
				return null;
			})
		: null;
	if (!bill) {
		return null;
	}
	return (
		<div className={className}>
			<OpenBillCard bill={bill} />
		</div>
	);
}
