"use server";

// actions.ts — the Kassen's bank accounts (/konten) (#33). Admins manage
// every Konto, a Kasse role the Konto of its own Kasse (checked per Konto
// by the service). The changes answer with an ActionResult (#216);
// getKontos is read by the page loader and throws for callers who are not
// members.

import { z } from "zod";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as konten from "./service";

export type { Konto } from "./service";

const KONTEN_PAGE = ["/konten"];

/** The Kontos the caller manages (all of them for Admins). */
export async function getKontos(): Promise<konten.Konto[]> {
	const { member, tenantId } = await requireCaller();
	return konten.managedKontos(await scopeOf(tenantId), member);
}

export const createKonto = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([konten.kontoInputSchema]),
		revalidate: KONTEN_PAGE,
		errorMessage: "Konto konnte nicht angelegt werden",
	},
	async ([input], { tenant }) => konten.createKonto(tenant, input),
);

export const updateKonto = defineAction(
	{
		schema: z.tuple([z.string(), konten.kontoInputSchema.partial()]),
		revalidate: KONTEN_PAGE,
		errorMessage: "Konto konnte nicht gespeichert werden",
	},
	async ([kontoId, input], { tenant, user }) =>
		konten.updateKonto(tenant, user, kontoId, input),
);

export const deleteKonto = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([z.string()]),
		revalidate: KONTEN_PAGE,
		errorMessage: "Konto konnte nicht gelöscht werden",
	},
	async ([kontoId], { tenant }) => konten.deleteKonto(tenant, kontoId),
);
