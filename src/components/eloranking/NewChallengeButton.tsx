"use client";

import { Swords } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useChallengeBadge } from "./ChallengeBadgeProvider";
import { CreateChallengeDialog } from "./CreateChallengeDialog";

export function NewChallengeButton() {
	const [open, setOpen] = useState(false);
	const { refresh } = useChallengeBadge();
	return (
		<>
			<Button
				onClick={() => setOpen(true)}
				className="bg-orange-500 hover:bg-orange-600"
			>
				<Swords className="mr-2 h-4 w-4" />
				Neue Herausforderung
			</Button>
			<CreateChallengeDialog
				isOpen={open}
				onClose={() => setOpen(false)}
				onCreated={refresh}
			/>
		</>
	);
}
