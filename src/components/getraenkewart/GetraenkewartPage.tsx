"use client";

import { SiteHeader } from "~/components/trinken/SiteHeader";
import {
	TabsContent,
	TabsList,
	TabsTrigger,
	UrlTabs,
} from "~/components/ui/tabs";

type Props = {
	getraenkeTab: React.ReactNode;
	inventurTab: React.ReactNode;
	verlaufTab: React.ReactNode;
	kasseTab: React.ReactNode;
	buchungTab: React.ReactNode;
};

const TABS = ["getraenke", "inventur", "verlauf", "kasse", "buchung"] as const;

export function GetraenkewartPage({
	getraenkeTab,
	inventurTab,
	verlaufTab,
	kasseTab,
	buchungTab,
}: Props) {
	// Every tab's data is already in the page (each streams in its own
	// Suspense boundary), so UrlTabs only updates the URL when switching.
	return (
		<div className="flex flex-col">
			<SiteHeader title="Getränkewart" />

			<div className="p-4 md:p-6">
				<UrlTabs values={TABS} defaultValue="getraenke">
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
				</UrlTabs>
			</div>
		</div>
	);
}
