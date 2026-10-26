import { redirect } from "next/navigation";
import { KostenerstattungPage } from "~/components/cc-kasse/KostenerstattungPage";
import { listMyReimbursements } from "~/server/actions/cc-kasse/kostenerstattungen";
import { getBookableKostenpunkte } from "~/server/actions/cc-kasse/kostenpunkte";
import { getMyPaymentInfo } from "~/server/actions/cc-kasse/paymentInfo";
import { auth } from "~/server/auth";

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
