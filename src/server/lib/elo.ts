export const DEFAULT_ELO = 1200;
const K_FACTOR = 32;
const K_FACTOR_HIGH_RATED = 16;
const K_FACTOR_EXPERIENCED = 24;

function calculateExpectedScore(
	playerElo: number,
	opponentElo: number,
): number {
	return 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));
}

function getKFactor(playerElo: number, totalGames: number): number {
	if (playerElo >= 2400) return K_FACTOR_HIGH_RATED;
	if (totalGames >= 30) return K_FACTOR_EXPERIENCED;
	return K_FACTOR;
}

export function calculateEloChange(
	player1Elo: number,
	player2Elo: number,
	player1TotalGames: number,
	player2TotalGames: number,
	player1Won: boolean,
): { player1NewElo: number; player2NewElo: number; eloChange: number } {
	const player1Expected = calculateExpectedScore(player1Elo, player2Elo);
	const player2Expected = calculateExpectedScore(player2Elo, player1Elo);
	const player1Score = player1Won ? 1 : 0;
	const player2Score = player1Won ? 0 : 1;
	const player1KFactor = getKFactor(player1Elo, player1TotalGames);
	const player2KFactor = getKFactor(player2Elo, player2TotalGames);
	const player1Change = Math.round(
		player1KFactor * (player1Score - player1Expected),
	);
	const player2Change = Math.round(
		player2KFactor * (player2Score - player2Expected),
	);

	return {
		player1NewElo: player1Elo + player1Change,
		player2NewElo: player2Elo + player2Change,
		eloChange: Math.abs(player1Change),
	};
}
