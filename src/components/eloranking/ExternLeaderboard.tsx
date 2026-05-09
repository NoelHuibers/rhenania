import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { getGlobalLeaderboard } from "~/server/actions/game/cross-tenant-discovery";

function initials(name: string | null, email: string): string {
	const src = name?.trim() || email;
	const parts = src.split(/[\s.@]/).filter(Boolean);
	return (
		(parts[0]?.[0] ?? "?").toUpperCase() + (parts[1]?.[0] ?? "").toUpperCase()
	);
}

export async function ExternLeaderboard() {
	const rows = await getGlobalLeaderboard(50);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Globale Rangliste</CardTitle>
				<p className="text-muted-foreground text-sm">
					Alle Corps zusammen, sortiert nach ELO. Cross-Corps-Spiele und interne
					Spiele zählen gleichermaßen.
				</p>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="py-8 text-center text-muted-foreground">
						Noch keine Spiele gespielt.
					</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead className="border-b text-muted-foreground">
								<tr>
									<th className="px-2 py-2 text-left font-medium">#</th>
									<th className="px-2 py-2 text-left font-medium">Spieler</th>
									<th className="px-2 py-2 text-left font-medium">Corps</th>
									<th className="px-2 py-2 text-right font-medium">ELO</th>
									<th className="px-2 py-2 text-right font-medium">W/L</th>
									<th className="px-2 py-2 text-right font-medium">Spiele</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r, i) => (
									<tr
										key={r.userId}
										className="border-b last:border-b-0 hover:bg-muted/30"
									>
										<td className="px-2 py-3 font-mono text-muted-foreground">
											{i + 1}
										</td>
										<td className="px-2 py-3">
											<div className="flex items-center gap-2">
												<Avatar className="h-7 w-7">
													<AvatarFallback className="text-xs">
														{initials(r.name, r.email)}
													</AvatarFallback>
												</Avatar>
												<span className="font-medium">{r.name ?? r.email}</span>
											</div>
										</td>
										<td className="px-2 py-3">
											<Badge variant="secondary" className="font-mono">
												{r.tenantSlug || "—"}
											</Badge>
										</td>
										<td className="px-2 py-3 text-right font-semibold">
											{r.currentElo}
										</td>
										<td className="px-2 py-3 text-right font-mono text-muted-foreground">
											{r.wins}-{r.losses}
										</td>
										<td className="px-2 py-3 text-right font-mono text-muted-foreground">
											{r.totalGames}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
