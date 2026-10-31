import { KontenPage } from "~/components/konten/KontenPage";
import { loadKontenPage } from "~/server/loaders/konten";

export default async function KontenRoute() {
	const { initialKontos, isAdmin } = await loadKontenPage();

	return <KontenPage initialKontos={initialKontos} isAdmin={isAdmin} />;
}

export const metadata = {
	title: "Konten",
	description: "Corps-Konten verwalten",
};
