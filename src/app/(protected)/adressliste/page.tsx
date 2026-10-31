import { AdresslistePage } from "~/components/members/AdresslistePage";
import { loadAdresslistePage } from "~/server/loaders/adressliste";

export default async function AdresslisteRoute() {
	const { members, canEdit, statusOptions } = await loadAdresslistePage();

	return (
		<AdresslistePage
			members={members}
			canEdit={canEdit}
			statusOptions={statusOptions}
		/>
	);
}

export const metadata = {
	title: "Adressliste",
	description: "Mitglieder-Adressliste",
};
