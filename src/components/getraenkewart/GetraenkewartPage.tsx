"use client";

import { useSearchParams } from "next/navigation";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

type Props = {
	getraenkeTab: React.ReactNode;
	inventurTab: React.ReactNode;
	verlaufTab: React.ReactNode;
	kasseTab: React.ReactNode;
	buchungTab: React.ReactNode;
};

export function GetraenkewartPage({
	getraenkeTab,
	inventurTab,
	verlaufTab,
	kasseTab,
	buchungTab,
}: Props) {
	const searchParams = useSearchParams();
	const activeTab = searchParams.get("tab") ?? "getraenke";

	// Every tab's data is already in the page (each streams in its own
	// Suspense boundary), so switching only updates the URL. The native
	// History API keeps useSearchParams in sync without a server round trip;
	// router.replace would re-run all tabs' queries.
	function handleTabChange(value: string) {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		window.history.replaceState(null, "", `?${params.toString()}`);
	}

	return (
		<div className="flex flex-col">
			<SiteHeader title="Getränkewart" />

			<div className="p-4 md:p-6">
				<Tabs value={activeTab} onValueChange={handleTabChange}>
					<TabsList>
						<TabsTrigger value="getraenke">Getränke</TabsTrigger>
						<TabsTrigger value="inventur">Inventur</TabsTrigger>
						<TabsTrigger value="verlauf">Verlauf</TabsTrigger>
						<TabsTrigger value="kasse">Kasse</TabsTrigger>
						<TabsTrigger value="buchung">Buchung</TabsTrigger>
					</TabsList>

					<TabsContent value="getraenke" className="mt-4">
						{getraenkeTab}
					</TabsContent>

					<TabsContent value="inventur" className="mt-4">
						{inventurTab}
					</TabsContent>

					<TabsContent value="verlauf" className="mt-4">
						{verlaufTab}
					</TabsContent>

					<TabsContent value="kasse" className="mt-4">
						{kasseTab}
					</TabsContent>

					<TabsContent value="buchung" className="mt-4">
						{buchungTab}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
