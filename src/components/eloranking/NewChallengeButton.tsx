import { Swords } from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";

export function NewChallengeButton() {
	return (
		<Button asChild className="bg-orange-500 hover:bg-orange-600">
			<Link href="/eloranking/challenges">
				<Swords className="mr-2 h-4 w-4" />
				Neue Herausforderung
			</Link>
		</Button>
	);
}
