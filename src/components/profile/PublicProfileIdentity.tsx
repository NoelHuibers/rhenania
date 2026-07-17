import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";

interface PublicProfileIdentityProps {
	name: string | null;
	image: string | null;
	roles?: string[];
}

function initials(name: string | null): string {
	return (name || "?")
		.split(" ")
		.map((n) => n[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}

export function PublicProfileIdentity({
	name,
	image,
	roles = [],
}: PublicProfileIdentityProps) {
	return (
		<Card>
			<CardContent className="flex flex-col items-center gap-4 py-6">
				<Avatar className="h-24 w-24">
					<AvatarImage src={image || undefined} alt={name || "Avatar"} />
					<AvatarFallback className="text-2xl">{initials(name)}</AvatarFallback>
				</Avatar>
				<div className="space-y-2 text-center">
					<p className="font-semibold text-xl">{name || "Unbekannt"}</p>
					{roles.length > 0 && (
						<div className="flex flex-wrap justify-center gap-1.5">
							{roles.map((role) => (
								<Badge key={role} variant="secondary">
									{role}
								</Badge>
							))}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
