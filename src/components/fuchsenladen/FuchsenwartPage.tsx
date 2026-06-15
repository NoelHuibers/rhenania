"use client";

import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { FuchsenBillsManagement } from "./FuchsenBillsManagement";
import { FuchsenItemsManagement } from "./FuchsenItemsManagement";

export default function FuchsenwartPage() {
	return (
		<>
			<SiteHeader title="Fuchsenwart" />
			<div className="container mx-auto space-y-4 p-4">
				<Tabs defaultValue="items" className="space-y-4">
					<TabsList>
						<TabsTrigger value="items">Artikel</TabsTrigger>
						<TabsTrigger value="bills">Rechnungen</TabsTrigger>
					</TabsList>

					<TabsContent value="items" className="space-y-4">
						<FuchsenItemsManagement />
					</TabsContent>

					<TabsContent value="bills" className="space-y-4">
						<FuchsenBillsManagement />
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
