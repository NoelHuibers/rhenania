"use client";

import { CheckCircle, Clock } from "lucide-react";
import Image from "next/image";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { FuchsenItem } from "~/server/actions/fuchsenladen/items";

interface FuchsenItemCardProps {
	item: FuchsenItem;
	onOrderClick: (item: FuchsenItem) => void;
}

export function FuchsenItemCard({ item, onOrderClick }: FuchsenItemCardProps) {
	const isAvailable = item.isCurrentlyAvailable;

	return (
		<Card
			className={
				isAvailable
					? "group transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
					: "bg-muted/30 opacity-75"
			}
		>
			<CardHeader className={isAvailable ? "pb-0" : ""}>
				<div className="relative h-32 w-full sm:h-40 md:h-48">
					<Image
						src={item.picture || "/placeholder.svg"}
						alt={item.name}
						fill
						sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
						className={`rounded-md object-cover ${
							!isAvailable ? "grayscale" : ""
						}`}
					/>
					<div className="absolute top-2 right-2">
						{isAvailable ? (
							<Badge className="bg-green-500 text-xs hover:bg-green-600">
								<CheckCircle className="mr-1 h-3 w-3" />
								<span className="hidden sm:inline">Verfügbar</span>
							</Badge>
						) : (
							<Badge className="bg-orange-500 text-white text-xs">
								<Clock className="mr-1 h-3 w-3" />
								<span className="hidden sm:inline">Nicht verfügbar</span>
							</Badge>
						)}
					</div>
				</div>

				<CardTitle
					className={`line-clamp-2 text-sm sm:text-base lg:text-lg ${
						isAvailable ? "transition-colors group-hover:text-primary" : ""
					}`}
				>
					{item.name}
				</CardTitle>
				{item.description && (
					<p className="line-clamp-2 text-muted-foreground text-xs">
						{item.description}
					</p>
				)}
			</CardHeader>

			<CardContent className="pt-0">
				<div className="flex flex-col gap-2">
					<div
						className={`font-bold text-lg sm:text-xl lg:text-2xl ${
							isAvailable
								? "text-emerald-600 dark:text-emerald-400"
								: "text-muted-foreground"
						}`}
					>
						€{item.price.toFixed(2)}
					</div>

					{isAvailable ? (
						<Button
							size="sm"
							onClick={() => onOrderClick(item)}
							className="w-full bg-green-500 text-white text-xs hover:bg-green-600 sm:text-sm"
						>
							Kaufen
						</Button>
					) : (
						<Button
							size="sm"
							variant="outline"
							disabled
							className="w-full cursor-not-allowed text-xs sm:text-sm"
						>
							Nicht verfügbar
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
