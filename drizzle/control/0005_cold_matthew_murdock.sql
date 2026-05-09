CREATE TABLE `control_cross_tenant_challenge` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`challengerId` text(255) NOT NULL,
	`challengerTenantId` text(255) NOT NULL,
	`opponentId` text(255) NOT NULL,
	`opponentTenantId` text(255) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment` text DEFAULT 'none' NOT NULL,
	`drinkName` text(255),
	`quantity` integer DEFAULT 2 NOT NULL,
	`proposedWinnerId` text(255),
	`proposedById` text(255),
	`proposedAt` integer,
	`createdAt` integer NOT NULL,
	`acceptedAt` integer,
	`declinedAt` integer,
	`respondDeadline` integer NOT NULL,
	`playDeadline` integer,
	`confirmDeadline` integer,
	`gameId` text(255),
	FOREIGN KEY (`challengerTenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opponentTenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cross_challenge_challenger_idx` ON `control_cross_tenant_challenge` (`challengerId`,`status`);--> statement-breakpoint
CREATE INDEX `cross_challenge_opponent_idx` ON `control_cross_tenant_challenge` (`opponentId`,`status`);--> statement-breakpoint
CREATE INDEX `cross_challenge_status_idx` ON `control_cross_tenant_challenge` (`status`);--> statement-breakpoint
CREATE INDEX `cross_challenge_created_idx` ON `control_cross_tenant_challenge` (`createdAt`);--> statement-breakpoint
CREATE TABLE `control_cross_tenant_game` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`player1Id` text(255) NOT NULL,
	`player1TenantId` text(255) NOT NULL,
	`player2Id` text(255) NOT NULL,
	`player2TenantId` text(255) NOT NULL,
	`winnerId` text(255) NOT NULL,
	`playedAt` integer NOT NULL,
	`player1EloBefore` integer DEFAULT 1200 NOT NULL,
	`player2EloBefore` integer DEFAULT 1200 NOT NULL,
	`player1EloAfter` integer DEFAULT 1200 NOT NULL,
	`player2EloAfter` integer DEFAULT 1200 NOT NULL,
	`challengeId` text(255),
	`gameType` text(50) DEFAULT 'bierjunge',
	FOREIGN KEY (`player1TenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`player2TenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cross_game_player1_idx` ON `control_cross_tenant_game` (`player1Id`);--> statement-breakpoint
CREATE INDEX `cross_game_player2_idx` ON `control_cross_tenant_game` (`player2Id`);--> statement-breakpoint
CREATE INDEX `cross_game_played_idx` ON `control_cross_tenant_game` (`playedAt`);--> statement-breakpoint
CREATE TABLE `control_user_stat` (
	`userId` text(255) PRIMARY KEY NOT NULL,
	`currentElo` integer DEFAULT 1200 NOT NULL,
	`totalGames` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`peakElo` integer DEFAULT 1200 NOT NULL,
	`lastGameAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_stat_elo_idx` ON `control_user_stat` (`currentElo`);