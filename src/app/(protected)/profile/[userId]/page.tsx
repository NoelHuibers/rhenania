import { Beer, Lock } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { GamesElo } from "~/components/profile/GamesElo";
import { PublicAchievements } from "~/components/profile/PublicAchievements";
import { PublicProfileIdentity } from "~/components/profile/PublicProfileIdentity";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Card, CardContent } from "~/components/ui/card";
import { getPublicProfile } from "~/server/actions/profile/public-profile";
import { auth } from "~/server/auth";

export default async function PublicProfilePage({
	params,
}: {
	params: Promise<{ userId: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	const { userId } = await params;
	const profile = await getPublicProfile(userId);

	if (profile.status === "not_found") {
		notFound();
	}

	return (
		<SidebarLayout>
			<SiteHeader title="Mitgliedsprofil" />
			<div className="flex-1 bg-background p-4 md:p-6">
				<div className="mx-auto max-w-7xl space-y-6">
					{session.user.id === userId && (
						<p className="text-center text-muted-foreground text-sm">
							So sehen andere dein Profil.
						</p>
					)}
					{profile.status === "private" ? (
						<div className="mx-auto max-w-md space-y-4">
							<PublicProfileIdentity
								name={profile.user.name}
								image={profile.user.image}
							/>
							<Card>
								<CardContent className="flex items-center justify-center gap-2 py-6 text-muted-foreground text-sm">
									<Lock className="h-4 w-4" />
									Dieses Profil ist privat.
								</CardContent>
							</Card>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
							<div className="space-y-6 lg:col-span-1">
								<PublicProfileIdentity
									name={profile.user.name}
									image={profile.user.image}
									roles={profile.user.roles}
								/>
								<Card>
									<CardContent className="flex items-center gap-3 py-6">
										<Beer className="h-8 w-8 text-amber-500" />
										<div>
											<p className="font-semibold text-2xl">
												{profile.drinkStats.litersLast6Months} L
											</p>
											<p className="text-muted-foreground text-sm">
												in den letzten 6 Monaten
											</p>
										</div>
									</CardContent>
								</Card>
							</div>
							<div className="space-y-6 lg:col-span-2">
								{profile.elo && (
									<GamesElo
										userStats={profile.elo.stats}
										eloHistory={profile.elo.eloHistory}
									/>
								)}
								<PublicAchievements
									achievements={profile.achievements}
									totalPoints={profile.totalPoints}
								/>
							</div>
						</div>
					)}
				</div>
			</div>
		</SidebarLayout>
	);
}
