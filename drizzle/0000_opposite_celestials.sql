CREATE TABLE `rhenania_account` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`accountId` text(255) NOT NULL,
	`providerId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text(255),
	`password` text(255),
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `rhenania_account` (`userId`);--> statement-breakpoint
CREATE TABLE `rhenania_achievement_progress` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`achievementId` text(255) NOT NULL,
	`currentValue` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`lastUpdated` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievementId`) REFERENCES `rhenania_achievement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_progress_unique_idx` ON `rhenania_achievement_progress` (`userId`,`achievementId`);--> statement-breakpoint
CREATE INDEX `achievement_progress_user_idx` ON `rhenania_achievement_progress` (`userId`);--> statement-breakpoint
CREATE INDEX `achievement_progress_achievement_idx` ON `rhenania_achievement_progress` (`achievementId`);--> statement-breakpoint
CREATE TABLE `rhenania_achievement` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(500) NOT NULL,
	`category` text NOT NULL,
	`icon` text(100),
	`targetValue` integer,
	`isSecret` integer DEFAULT false NOT NULL,
	`points` integer DEFAULT 10 NOT NULL,
	`rarity` text DEFAULT 'common' NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_achievement_key_unique` ON `rhenania_achievement` (`key`);--> statement-breakpoint
CREATE INDEX `achievement_category_idx` ON `rhenania_achievement` (`category`);--> statement-breakpoint
CREATE INDEX `achievement_active_idx` ON `rhenania_achievement` (`isActive`);--> statement-breakpoint
CREATE INDEX `achievement_rarity_idx` ON `rhenania_achievement` (`rarity`);--> statement-breakpoint
CREATE TABLE `rhenania_bank_entry` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`amount` real NOT NULL,
	`description` text(500) NOT NULL,
	`date` integer NOT NULL,
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bank_entry_date_idx` ON `rhenania_bank_entry` (`date`);--> statement-breakpoint
CREATE INDEX `bank_entry_created_idx` ON `rhenania_bank_entry` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_bill_csv` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billPeriodId` text(255) NOT NULL,
	`blobUrl` text NOT NULL,
	`fileName` text(255) NOT NULL,
	`delimiter` text(10) DEFAULT '	' NOT NULL,
	`fileSize` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billPeriodId`) REFERENCES `rhenania_bill_period`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_csv_period_idx` ON `rhenania_bill_csv` (`billPeriodId`);--> statement-breakpoint
CREATE INDEX `bill_csv_created_idx` ON `rhenania_bill_csv` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_bill_item` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billId` text(255) NOT NULL,
	`drinkName` text(255) NOT NULL,
	`amount` integer NOT NULL,
	`pricePerDrink` real NOT NULL,
	`totalPricePerDrink` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billId`) REFERENCES `rhenania_bill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_item_bill_idx` ON `rhenania_bill_item` (`billId`);--> statement-breakpoint
CREATE INDEX `bill_item_drink_idx` ON `rhenania_bill_item` (`drinkName`);--> statement-breakpoint
CREATE TABLE `rhenania_bill_pdf` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`blobUrl` text NOT NULL,
	`fileName` text NOT NULL,
	`fileSize` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billId`) REFERENCES `rhenania_bill`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_pdf_bill_idx` ON `rhenania_bill_pdf` (`billId`);--> statement-breakpoint
CREATE INDEX `bill_pdf_user_idx` ON `rhenania_bill_pdf` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_pdf_unique_idx` ON `rhenania_bill_pdf` (`billId`);--> statement-breakpoint
CREATE TABLE `rhenania_bill_period` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billNumber` text NOT NULL,
	`totalAmount` real DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`createdBy` text(255),
	`updatedAt` integer,
	`closedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_bill_period_billNumber_unique` ON `rhenania_bill_period` (`billNumber`);--> statement-breakpoint
CREATE INDEX `bill_period_number_idx` ON `rhenania_bill_period` (`billNumber`);--> statement-breakpoint
CREATE INDEX `bill_period_dates_idx` ON `rhenania_bill_period` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_bill` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billPeriodId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`userName` text(255) NOT NULL,
	`status` text DEFAULT 'Unbezahlt' NOT NULL,
	`oldBillingAmount` real DEFAULT 0 NOT NULL,
	`fees` real DEFAULT 0 NOT NULL,
	`umlage` real DEFAULT 0 NOT NULL,
	`drinksTotal` real NOT NULL,
	`total` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	`paidAt` integer,
	FOREIGN KEY (`billPeriodId`) REFERENCES `rhenania_bill_period`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_period_idx` ON `rhenania_bill` (`billPeriodId`);--> statement-breakpoint
CREATE INDEX `bill_user_idx` ON `rhenania_bill` (`userId`);--> statement-breakpoint
CREATE INDEX `bill_status_idx` ON `rhenania_bill` (`status`);--> statement-breakpoint
CREATE INDEX `bill_created_idx` ON `rhenania_bill` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_calendar_token` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastUsedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_calendar_token_token_unique` ON `rhenania_calendar_token` (`token`);--> statement-breakpoint
CREATE INDEX `calendar_token_user_idx` ON `rhenania_calendar_token` (`userId`);--> statement-breakpoint
CREATE INDEX `calendar_token_token_idx` ON `rhenania_calendar_token` (`token`);--> statement-breakpoint
CREATE TABLE `rhenania_challenge` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`challengerId` text(255) NOT NULL,
	`opponentId` text(255) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payment` text DEFAULT 'challenger' NOT NULL,
	`drinkId` text(255) NOT NULL,
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
	FOREIGN KEY (`challengerId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponentId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`drinkId`) REFERENCES `rhenania_drink`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposedWinnerId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposedById`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `challenge_challenger_status_idx` ON `rhenania_challenge` (`challengerId`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_opponent_status_idx` ON `rhenania_challenge` (`opponentId`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_status_idx` ON `rhenania_challenge` (`status`);--> statement-breakpoint
CREATE INDEX `challenge_created_idx` ON `rhenania_challenge` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_drink` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`price` real NOT NULL,
	`kastengroesse` integer,
	`volume` real,
	`picture` text,
	`isCurrentlyAvailable` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `drink_name_idx` ON `rhenania_drink` (`name`);--> statement-breakpoint
CREATE INDEX `drink_available_idx` ON `rhenania_drink` (`isCurrentlyAvailable`);--> statement-breakpoint
CREATE TABLE `rhenania_event_rsvp` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`eventId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`status` text NOT NULL,
	`note` text(500),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`eventId`) REFERENCES `rhenania_event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_rsvp_unique_idx` ON `rhenania_event_rsvp` (`eventId`,`userId`);--> statement-breakpoint
CREATE INDEX `event_rsvp_event_idx` ON `rhenania_event_rsvp` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_rsvp_user_idx` ON `rhenania_event_rsvp` (`userId`);--> statement-breakpoint
CREATE TABLE `rhenania_event` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`title` text(255) NOT NULL,
	`description` text(1000),
	`date` integer NOT NULL,
	`endDate` integer,
	`location` text(255),
	`type` text DEFAULT 'Sonstige' NOT NULL,
	`isPublic` integer DEFAULT true NOT NULL,
	`isCancelled` integer DEFAULT false NOT NULL,
	`meetingUrl` text(2048),
	`rsvpDeadline` integer,
	`maxAttendees` integer,
	`recurringEventId` text(255),
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`recurringEventId`) REFERENCES `rhenania_recurring_event`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_date_idx` ON `rhenania_event` (`date`);--> statement-breakpoint
CREATE INDEX `event_type_idx` ON `rhenania_event` (`type`);--> statement-breakpoint
CREATE INDEX `event_public_idx` ON `rhenania_event` (`isPublic`);--> statement-breakpoint
CREATE INDEX `event_recurring_idx` ON `rhenania_event` (`recurringEventId`);--> statement-breakpoint
CREATE TABLE `rhenania_external_bill` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`creditor` text(255) NOT NULL,
	`description` text(500) NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'Offen' NOT NULL,
	`paidAt` integer,
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`createdBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `external_bill_status_idx` ON `rhenania_external_bill` (`status`);--> statement-breakpoint
CREATE INDEX `external_bill_created_idx` ON `rhenania_external_bill` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_game` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`player1Id` text(255) NOT NULL,
	`player2Id` text(255) NOT NULL,
	`winnerId` text(255) NOT NULL,
	`playedAt` integer NOT NULL,
	`player1EloBefore` integer DEFAULT 1200,
	`player2EloBefore` integer DEFAULT 1200,
	`player1EloAfter` integer DEFAULT 1200,
	`player2EloAfter` integer DEFAULT 1200,
	`orderId` text(255),
	`challengeId` text(255),
	`gameType` text(50) DEFAULT 'bierjunge',
	FOREIGN KEY (`player1Id`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player2Id`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winnerId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rhenania_homepage_image` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`section` text NOT NULL,
	`imageUrl` text NOT NULL,
	`imageName` text(255) NOT NULL,
	`fileSize` integer,
	`mimeType` text(50),
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`uploadedBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`uploadedBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `homepage_image_section_idx` ON `rhenania_homepage_image` (`section`);--> statement-breakpoint
CREATE INDEX `homepage_image_active_idx` ON `rhenania_homepage_image` (`isActive`);--> statement-breakpoint
CREATE INDEX `homepage_image_order_idx` ON `rhenania_homepage_image` (`displayOrder`);--> statement-breakpoint
CREATE INDEX `homepage_image_section_active_idx` ON `rhenania_homepage_image` (`section`,`isActive`);--> statement-breakpoint
CREATE TABLE `rhenania_inventory` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`totalLoss` real DEFAULT 0 NOT NULL,
	`performedBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`closedAt` integer,
	FOREIGN KEY (`performedBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_status_idx` ON `rhenania_inventory` (`status`);--> statement-breakpoint
CREATE TABLE `rhenania_inventory_item` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`inventoryId` text(255) NOT NULL,
	`drinkId` text(255) NOT NULL,
	`countedStock` integer NOT NULL,
	`previousStock` integer DEFAULT 0 NOT NULL,
	`purchasedSince` integer DEFAULT 0 NOT NULL,
	`soldSince` integer DEFAULT 0 NOT NULL,
	`priceAtCount` real NOT NULL,
	`lossValue` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`inventoryId`) REFERENCES `rhenania_inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`drinkId`) REFERENCES `rhenania_drink`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_item_inventory_idx` ON `rhenania_inventory_item` (`inventoryId`);--> statement-breakpoint
CREATE INDEX `inventory_item_drink_idx` ON `rhenania_inventory_item` (`drinkId`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_unique_idx` ON `rhenania_inventory_item` (`inventoryId`,`drinkId`);--> statement-breakpoint
CREATE TABLE `rhenania_kasse_config` (
	`id` text(50) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`pfandWert` real DEFAULT 0 NOT NULL,
	`updatedAt` integer,
	`updatedBy` text(255),
	FOREIGN KEY (`updatedBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rhenania_konto` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`kasseType` text NOT NULL,
	`iban` text(50) NOT NULL,
	`bic` text(20) NOT NULL,
	`bankName` text(255) NOT NULL,
	`description` text(500),
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `konto_type_idx` ON `rhenania_konto` (`kasseType`);--> statement-breakpoint
CREATE TABLE `rhenania_order` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`userName` text(255) NOT NULL,
	`drinkId` text(255) NOT NULL,
	`drinkName` text(255) NOT NULL,
	`amount` integer NOT NULL,
	`pricePerUnit` real NOT NULL,
	`total` real NOT NULL,
	`inBill` integer DEFAULT false NOT NULL,
	`bookingFor` text(255),
	`bookedByAdminId` text(255),
	`bookedByAdminName` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`drinkId`) REFERENCES `rhenania_drink`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_user_idx` ON `rhenania_order` (`userId`);--> statement-breakpoint
CREATE INDEX `order_drink_idx` ON `rhenania_order` (`drinkId`);--> statement-breakpoint
CREATE INDEX `order_created_idx` ON `rhenania_order` (`createdAt`);--> statement-breakpoint
CREATE TABLE `rhenania_password_reset_token` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expires` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_password_reset_token_token_unique` ON `rhenania_password_reset_token` (`token`);--> statement-breakpoint
CREATE INDEX `password_reset_email_idx` ON `rhenania_password_reset_token` (`email`);--> statement-breakpoint
CREATE INDEX `password_reset_token_idx` ON `rhenania_password_reset_token` (`token`);--> statement-breakpoint
CREATE TABLE `rhenania_recurring_event` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`title` text(255) NOT NULL,
	`description` text(1000),
	`location` text(255) DEFAULT 'adH Rhenania',
	`type` text DEFAULT 'Sonstige' NOT NULL,
	`recurrenceType` text NOT NULL,
	`dayOfWeek` integer,
	`time` text(5) DEFAULT '20:00' NOT NULL,
	`isPublic` integer DEFAULT true NOT NULL,
	`meetingUrl` text(2048),
	`startDate` integer,
	`endDate` integer,
	`isActive` integer DEFAULT true NOT NULL,
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`createdBy`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurring_event_type_idx` ON `rhenania_recurring_event` (`type`);--> statement-breakpoint
CREATE INDEX `recurring_event_active_idx` ON `rhenania_recurring_event` (`isActive`);--> statement-breakpoint
CREATE TABLE `rhenania_role` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(50) NOT NULL,
	`description` text(255),
	`createdAt` integer DEFAULT (unixepoch()),
	`updatedAt` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_role_name_unique` ON `rhenania_role` (`name`);--> statement-breakpoint
CREATE TABLE `rhenania_semester_config` (
	`id` text(50) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`name` text(255) DEFAULT '' NOT NULL,
	`startDate` integer,
	`endDate` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `rhenania_session` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text(255) NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text(255),
	`userAgent` text(255),
	`userId` text(255) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_session_token_unique` ON `rhenania_session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `rhenania_session` (`userId`);--> statement-breakpoint
CREATE TABLE `rhenania_user_achievement` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`achievementId` text(255) NOT NULL,
	`unlockedAt` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`notificationSent` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievementId`) REFERENCES `rhenania_achievement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_achievement_unique_idx` ON `rhenania_user_achievement` (`userId`,`achievementId`);--> statement-breakpoint
CREATE INDEX `user_achievement_user_idx` ON `rhenania_user_achievement` (`userId`);--> statement-breakpoint
CREATE INDEX `user_achievement_achievement_idx` ON `rhenania_user_achievement` (`achievementId`);--> statement-breakpoint
CREATE INDEX `user_achievement_unlocked_idx` ON `rhenania_user_achievement` (`unlockedAt`);--> statement-breakpoint
CREATE TABLE `rhenania_user_preference` (
	`userId` text(255) NOT NULL,
	`key` text(100) NOT NULL,
	`value` text NOT NULL,
	`valueType` text DEFAULT 'json' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()),
	`updatedAt` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`userId`, `key`),
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_pref_user_idx` ON `rhenania_user_preference` (`userId`);--> statement-breakpoint
CREATE INDEX `user_pref_key_idx` ON `rhenania_user_preference` (`key`);--> statement-breakpoint
CREATE TABLE `rhenania_user_role` (
	`userId` text(255) NOT NULL,
	`roleId` text(255) NOT NULL,
	`assignedAt` integer DEFAULT (unixepoch()),
	`assignedBy` text(255),
	PRIMARY KEY(`userId`, `roleId`),
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roleId`) REFERENCES `rhenania_role`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_roles_user_id_idx` ON `rhenania_user_role` (`userId`);--> statement-breakpoint
CREATE INDEX `user_roles_role_id_idx` ON `rhenania_user_role` (`roleId`);--> statement-breakpoint
CREATE TABLE `rhenania_user_stat` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`currentElo` integer DEFAULT 1200 NOT NULL,
	`totalGames` integer DEFAULT 0 NOT NULL,
	`wins` integer DEFAULT 0 NOT NULL,
	`losses` integer DEFAULT 0 NOT NULL,
	`lastGameAt` integer,
	`peakElo` integer DEFAULT 1200 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `rhenania_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `rhenania_user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255) NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text(255),
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_user_email_unique` ON `rhenania_user` (`email`);--> statement-breakpoint
CREATE TABLE `rhenania_venue` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`shortName` text(255) NOT NULL,
	`fullAddress` text(500) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_venue_shortName_unique` ON `rhenania_venue` (`shortName`);--> statement-breakpoint
CREATE UNIQUE INDEX `venue_short_name_idx` ON `rhenania_venue` (`shortName`);--> statement-breakpoint
CREATE TABLE `rhenania_verification_token` (
	`identifier` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
CREATE TABLE `rhenania_verification` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`identifier` text(255) NOT NULL,
	`value` text(255) NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
