"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
export interface Consumer {
	id: number;
	name: string;
	avatar: string;
	amount: number; // Liter
	change: string; // z. B. "+12%"
}

interface LeaderboardProps {
	consumers: Consumer[];
}

function getRankIcon(rank: number) {
	switch (rank) {
		case 1:
			return "🥇";
		case 2:
			return "🥈";
		case 3:
			return "🥉";
		default:
			return `#${rank}`;
	}
}

function getChangeBadgeStyle(change: string) {
	const isNegative = change.startsWith("-");

	if (isNegative) {
		return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
	} else {
		return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
	}
}

function getChangeBadgeStyleOutline(change: string) {
	const isNegative = change.startsWith("-");

	if (isNegative) {
		return "text-red-600 border-red-200 dark:text-red-400 dark:border-red-900/60";
	} else {
		return "text-green-600 border-green-200 dark:text-green-400 dark:border-green-900/60";
	}
}

export default function Leaderboard({ consumers }: LeaderboardProps) {
	const [showAll, setShowAll] = useState(false);
	const topConsumers = consumers.slice(0, 5);
	const remainingConsumers = consumers.slice(5);

	return (
		<Card className="lg:col-span-1">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<span>🏆</span>
					Top-Performer
				</CardTitle>
				<CardDescription>Alkoholkonsum der letzten 6 Monate</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{topConsumers.map((consumer, index) => (
					<div
						key={consumer.id}
						className="flex items-center justify-between rounded-lg border bg-muted/50 p-3"
					>
						<div className="flex items-center gap-3">
							<div className="w-12 text-center font-bold text-2xl">
								{getRankIcon(index + 1)}
							</div>
							<Avatar className="h-10 w-10">
								<AvatarImage
									src={consumer.avatar || "/placeholder.svg"}
									alt={consumer.name}
								/>
								<AvatarFallback>
									{consumer.name
										.split(" ")
										.map((n) => n[0])
										.join("")}
								</AvatarFallback>
							</Avatar>
							<div>
								<p className="font-semibold text-foreground">{consumer.name}</p>
								<p className="text-muted-foreground text-sm">
									{consumer.amount}L getrunken
								</p>
							</div>
						</div>
						<Badge
							variant="secondary"
							className={getChangeBadgeStyle(consumer.change)}
						>
							{consumer.change}
						</Badge>
					</div>
				))}

				<Button
					variant="outline"
					onClick={() => setShowAll(!showAll)}
					className="mt-4 w-full"
				>
					{showAll ? (
						<>
							<ChevronUp className="mr-2 h-4 w-4" />
							Weniger anzeigen
						</>
					) : (
						<>
							<ChevronDown className="mr-2 h-4 w-4" />
							Alle anzeigen ({remainingConsumers.length} weitere)
						</>
					)}
				</Button>

				{showAll && (
					<div className="mt-4 space-y-3 border-t pt-4">
						{remainingConsumers.map((consumer, index) => (
							<div
								key={consumer.id}
								className="flex items-center justify-between rounded-lg p-2 hover:bg-muted"
							>
								<div className="flex items-center gap-3">
									<div className="w-12 text-center font-semibold text-lg text-muted-foreground">
										#{index + 6}
									</div>
									<Avatar className="h-8 w-8">
										<AvatarImage
											src={consumer.avatar || "/placeholder.svg"}
											alt={consumer.name}
										/>
										<AvatarFallback className="text-xs">
											{consumer.name
												.split(" ")
												.map((n) => n[0])
												.join("")}
										</AvatarFallback>
									</Avatar>
									<div>
										<p className="font-medium text-foreground">
											{consumer.name}
										</p>
										<p className="text-muted-foreground text-sm">
											{consumer.amount}L
										</p>
									</div>
								</div>
								<Badge
									variant="outline"
									className={getChangeBadgeStyleOutline(consumer.change)}
								>
									{consumer.change}
								</Badge>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
