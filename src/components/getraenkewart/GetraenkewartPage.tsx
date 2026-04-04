"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

type Props = {
	getraenkeTab: React.ReactNode;
	inventurTab: React.ReactNode;
	kasseTab: React.ReactNode;
};

export default function GetraenkewartPage({
	getraenkeTab,
	inventurTab,
	kasseTab,
}: Props) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const activeTab = searchParams.get("tab") ?? "getraenke";

	function handleTabChange(value: string) {
		const params = new URLSearchParams(searchParams.toString());
		params.set("tab", value);
		router.replace(`/getraenkewart?${params.toString()}`);
	}

	return (
		<div className="flex flex-col">
			<SiteHeader title="Getränkewart" />

			<div className="p-4 md:p-6">
				<Tabs value={activeTab} onValueChange={handleTabChange}>
					<TabsList>
						<TabsTrigger value="getraenke">Getränke</TabsTrigger>
						<TabsTrigger value="inventur">Inventur</TabsTrigger>
						<TabsTrigger value="kasse">Kasse</TabsTrigger>
					</TabsList>

					<TabsContent value="getraenke" className="mt-4">
						{getraenkeTab}
					</TabsContent>

					<TabsContent value="inventur" className="mt-4">
						{inventurTab}
					</TabsContent>

					<TabsContent value="kasse" className="mt-4">
						{kasseTab}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
