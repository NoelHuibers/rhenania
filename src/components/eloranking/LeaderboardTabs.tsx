"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

// Client wrapper around the radix Tabs so the eloranking page (a server
// component) can pass both leaderboards as already-rendered server-component
// children. Default tab is "global".
export function LeaderboardTabs({
	global,
	internal,
}: {
	global: React.ReactNode;
	internal: React.ReactNode;
}) {
	return (
		<Tabs defaultValue="global" className="w-full">
			<TabsList className="grid w-full grid-cols-2 sm:w-auto">
				<TabsTrigger value="global">Global</TabsTrigger>
				<TabsTrigger value="internal">Intern</TabsTrigger>
			</TabsList>

			<TabsContent value="global" className="mt-4">
				{global}
			</TabsContent>
			<TabsContent value="internal" className="mt-4">
				{internal}
			</TabsContent>
		</Tabs>
	);
}
