import { redirect } from "next/navigation";
import { KostenerstattungPage } from "~/components/cc-kasse/KostenerstattungPage";
import { auth } from "~/server/auth";
import {
	getBookableKostenpunkte,
	getMyPaymentInfo,
	listMyReimbursements,
} from "~/server/modules/cc-kasse/actions";

export default async function KostenerstattungRoute() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	const [reimbursements, paymentInfo, kostenpunkte] = await Promise.all([
		listMyReimbursements(),
		getMyPaymentInfo(),
		getBookableKostenpunkte(),
	]);

	return (
		<KostenerstattungPage
			reimbursements={reimbursements}
			paymentInfo={paymentInfo}
			kostenpunkte={kostenpunkte}
		/>
	);
}

export const metadata = {
	title: "Kostenerstattung",
	description: "Kostenerstattungen einreichen und verfolgen",
};
