"use client";

import { BankLog } from "~/components/getraenkewart/kasse/BankLog";
import { EntityBillsCard } from "~/components/getraenkewart/kasse/EntityBillsCard";
import { ExternalBillsCard } from "~/components/getraenkewart/kasse/ExternalBillsCard";
import { GetraenkeBillingCard } from "~/components/getraenkewart/kasse/GetraenkeBillingCard";
import { GetraenkeSettingsCard } from "~/components/getraenkewart/kasse/GetraenkeSettingsCard";
import { MemberBillsCard } from "~/components/getraenkewart/kasse/MemberBillsCard";
import { NeueRechnungCard } from "~/components/getraenkewart/kasse/NeueRechnungCard";
import { SummarySection } from "~/components/getraenkewart/kasse/SummarySection";
import type {
	BankEntry,
	EntityBill,
	ExternalBill,
	MemberBill,
	Summary,
} from "~/components/getraenkewart/kasse/types";
import type {
	GetraenkeBillingSettings,
	GetraenkeSettings,
} from "~/server/actions/getraenkewart/kasse";

type Props = {
	summary: Summary;
	bankEntries: BankEntry[];
	externalBills: ExternalBill[];
	entityBills: EntityBill[];
	memberBills: MemberBill[];
	pfandWert: number;
	/** Feature settings; null for tenants without markup / treasurer features. */
	settings?: GetraenkeSettings | null;
	/** Sender and account of the bills; null for non-Getränkewarte. */
	billing?: GetraenkeBillingSettings | null;
};

/** The Kasse tab: one card per concern, each in its own file under kasse/. */
export function KasseTab({
	summary,
	bankEntries,
	externalBills,
	entityBills,
	memberBills,
	pfandWert,
	settings = null,
	billing = null,
}: Props) {
	return (
		<div className="flex flex-col gap-6">
			<SummarySection summary={summary} pfandWert={pfandWert} />
			{billing && <GetraenkeBillingCard settings={billing} />}
			{settings && <GetraenkeSettingsCard settings={settings} />}
			<NeueRechnungCard />
			<BankLog entries={bankEntries} />
			<MemberBillsCard bills={memberBills} />
			<EntityBillsCard bills={entityBills} />
			<ExternalBillsCard bills={externalBills} />
		</div>
	);
}
