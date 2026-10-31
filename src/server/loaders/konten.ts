// konten.ts — data for the /konten page.

import "server-only";

import { getKontos } from "~/server/actions/kontos/kontos";
import { requirePageRoles } from "./page-access";

const ALLOWED_ROLES = ["Admin", "Getränkewart", "CC-Kasse", "Aktivenkasse"];

export async function loadKontenPage() {
	const roleNames = await requirePageRoles(ALLOWED_ROLES);
	const result = await getKontos();
	return {
		initialKontos: result.success ? result.kontos : [],
		isAdmin: roleNames.includes("Admin"),
	};
}
