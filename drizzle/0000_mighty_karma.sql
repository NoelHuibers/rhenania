CREATE TABLE `achievement_progress` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`achievementId` text(255) NOT NULL,
	`currentValue` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	`lastUpdated` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievementId`) REFERENCES `achievement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_progress_unique_idx` ON `achievement_progress` (`userId`,`achievementId`);--> statement-breakpoint
CREATE INDEX `achievement_progress_user_idx` ON `achievement_progress` (`userId`);--> statement-breakpoint
CREATE INDEX `achievement_progress_achievement_idx` ON `achievement_progress` (`achievementId`);--> statement-breakpoint
CREATE TABLE `achievement` (
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
CREATE UNIQUE INDEX `achievement_key_unique` ON `achievement` (`key`);--> statement-breakpoint
CREATE INDEX `achievement_category_idx` ON `achievement` (`category`);--> statement-breakpoint
CREATE INDEX `achievement_active_idx` ON `achievement` (`isActive`);--> statement-breakpoint
CREATE INDEX `achievement_rarity_idx` ON `achievement` (`rarity`);--> statement-breakpoint
CREATE TABLE `bank_entry` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`amount` real NOT NULL,
	`description` text(500) NOT NULL,
	`date` integer NOT NULL,
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bank_entry_date_idx` ON `bank_entry` (`date`);--> statement-breakpoint
CREATE INDEX `bank_entry_created_idx` ON `bank_entry` (`createdAt`);--> statement-breakpoint
CREATE TABLE `bill_csv` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billPeriodId` text(255) NOT NULL,
	`blobUrl` text NOT NULL,
	`fileName` text(255) NOT NULL,
	`delimiter` text(10) DEFAULT '	' NOT NULL,
	`fileSize` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billPeriodId`) REFERENCES `bill_period`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_csv_period_idx` ON `bill_csv` (`billPeriodId`);--> statement-breakpoint
CREATE INDEX `bill_csv_created_idx` ON `bill_csv` (`createdAt`);--> statement-breakpoint
CREATE TABLE `bill_item` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billId` text(255) NOT NULL,
	`drinkName` text(255) NOT NULL,
	`amount` integer NOT NULL,
	`pricePerDrink` real NOT NULL,
	`totalPricePerDrink` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billId`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_item_bill_idx` ON `bill_item` (`billId`);--> statement-breakpoint
CREATE INDEX `bill_item_drink_idx` ON `bill_item` (`drinkName`);--> statement-breakpoint
CREATE TABLE `bill_pdf` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`blobUrl` text NOT NULL,
	`fileName` text NOT NULL,
	`fileSize` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billId`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_pdf_bill_idx` ON `bill_pdf` (`billId`);--> statement-breakpoint
CREATE INDEX `bill_pdf_user_idx` ON `bill_pdf` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_pdf_unique_idx` ON `bill_pdf` (`billId`);--> statement-breakpoint
CREATE TABLE `bill_period` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billNumber` text NOT NULL,
	`totalAmount` real DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`createdBy` text(255),
	`updatedAt` integer,
	`closedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_period_billNumber_unique` ON `bill_period` (`billNumber`);--> statement-breakpoint
CREATE INDEX `bill_period_number_idx` ON `bill_period` (`billNumber`);--> statement-breakpoint
CREATE INDEX `bill_period_dates_idx` ON `bill_period` (`createdAt`);--> statement-breakpoint
CREATE TABLE `bill` (
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
	FOREIGN KEY (`billPeriodId`) REFERENCES `bill_period`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_period_idx` ON `bill` (`billPeriodId`);--> statement-breakpoint
CREATE INDEX `bill_user_idx` ON `bill` (`userId`);--> statement-breakpoint
CREATE INDEX `bill_status_idx` ON `bill` (`status`);--> statement-breakpoint
CREATE INDEX `bill_created_idx` ON `bill` (`createdAt`);--> statement-breakpoint
CREATE TABLE `calendar_token` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`lastUsedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_token_token_unique` ON `calendar_token` (`token`);--> statement-breakpoint
CREATE INDEX `calendar_token_user_idx` ON `calendar_token` (`userId`);--> statement-breakpoint
CREATE INDEX `calendar_token_token_idx` ON `calendar_token` (`token`);--> statement-breakpoint
CREATE TABLE `challenge` (
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
	FOREIGN KEY (`challengerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opponentId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`drinkId`) REFERENCES `drink`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposedWinnerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`proposedById`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `challenge_challenger_status_idx` ON `challenge` (`challengerId`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_opponent_status_idx` ON `challenge` (`opponentId`,`status`);--> statement-breakpoint
CREATE INDEX `challenge_status_idx` ON `challenge` (`status`);--> statement-breakpoint
CREATE INDEX `challenge_created_idx` ON `challenge` (`createdAt`);--> statement-breakpoint
CREATE TABLE `drink` (
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
CREATE INDEX `drink_name_idx` ON `drink` (`name`);--> statement-breakpoint
CREATE INDEX `drink_available_idx` ON `drink` (`isCurrentlyAvailable`);--> statement-breakpoint
CREATE TABLE `event_rsvp` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`eventId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`status` text NOT NULL,
	`note` text(500),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`eventId`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_rsvp_unique_idx` ON `event_rsvp` (`eventId`,`userId`);--> statement-breakpoint
CREATE INDEX `event_rsvp_event_idx` ON `event_rsvp` (`eventId`);--> statement-breakpoint
CREATE INDEX `event_rsvp_user_idx` ON `event_rsvp` (`userId`);--> statement-breakpoint
CREATE TABLE `event_type` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_type_key_unique` ON `event_type` (`key`);--> statement-breakpoint
CREATE INDEX `event_type_active_idx` ON `event_type` (`isActive`);--> statement-breakpoint
CREATE TABLE `event` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`title` text(255) NOT NULL,
	`description` text(1000),
	`date` integer NOT NULL,
	`endDate` integer,
	`location` text(255),
	`type` text(100) DEFAULT 'Sonstige' NOT NULL,
	`isPublic` integer DEFAULT true NOT NULL,
	`isCancelled` integer DEFAULT false NOT NULL,
	`meetingUrl` text(2048),
	`rsvpDeadline` integer,
	`maxAttendees` integer,
	`recurringEventId` text(255),
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`recurringEventId`) REFERENCES `recurring_event`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `event_date_idx` ON `event` (`date`);--> statement-breakpoint
CREATE INDEX `event_type_idx` ON `event` (`type`);--> statement-breakpoint
CREATE INDEX `event_public_idx` ON `event` (`isPublic`);--> statement-breakpoint
CREATE INDEX `event_recurring_idx` ON `event` (`recurringEventId`);--> statement-breakpoint
CREATE TABLE `external_bill` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`creditor` text(255) NOT NULL,
	`description` text(500) NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'Offen' NOT NULL,
	`paidAt` integer,
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `external_bill_status_idx` ON `external_bill` (`status`);--> statement-breakpoint
CREATE INDEX `external_bill_created_idx` ON `external_bill` (`createdAt`);--> statement-breakpoint
CREATE TABLE `game` (
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
	FOREIGN KEY (`player1Id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`player2Id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`winnerId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `homepage_image` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`section` text(100) NOT NULL,
	`imageUrl` text NOT NULL,
	`imageName` text(255) NOT NULL,
	`fileSize` integer,
	`mimeType` text(50),
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`uploadedBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`uploadedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `homepage_image_section_idx` ON `homepage_image` (`section`);--> statement-breakpoint
CREATE INDEX `homepage_image_active_idx` ON `homepage_image` (`isActive`);--> statement-breakpoint
CREATE INDEX `homepage_image_order_idx` ON `homepage_image` (`displayOrder`);--> statement-breakpoint
CREATE INDEX `homepage_image_section_active_idx` ON `homepage_image` (`section`,`isActive`);--> statement-breakpoint
CREATE TABLE `homepage_section` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `homepage_section_key_unique` ON `homepage_section` (`key`);--> statement-breakpoint
CREATE INDEX `homepage_section_active_idx` ON `homepage_section` (`isActive`);--> statement-breakpoint
CREATE TABLE `inventory` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`totalLoss` real DEFAULT 0 NOT NULL,
	`performedBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`closedAt` integer,
	FOREIGN KEY (`performedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_status_idx` ON `inventory` (`status`);--> statement-breakpoint
CREATE TABLE `inventory_item` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`inventoryId` text(255) NOT NULL,
	`drinkId` text(255) NOT NULL,
	`countedStock` integer NOT NULL,
	`previousStock` integer DEFAULT 0 NOT NULL,
	`purchasedSince` integer DEFAULT 0 NOT NULL,
	`soldSince` integer DEFAULT 0 NOT NULL,
	`priceAtCount` real NOT NULL,
	`lossValue` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`inventoryId`) REFERENCES `inventory`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`drinkId`) REFERENCES `drink`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inventory_item_inventory_idx` ON `inventory_item` (`inventoryId`);--> statement-breakpoint
CREATE INDEX `inventory_item_drink_idx` ON `inventory_item` (`drinkId`);--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_item_unique_idx` ON `inventory_item` (`inventoryId`,`drinkId`);--> statement-breakpoint
CREATE TABLE `kasse_config` (
	`id` text(50) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`pfandWert` real DEFAULT 0 NOT NULL,
	`updatedAt` integer,
	`updatedBy` text(255),
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `kasse_type` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kasse_type_key_unique` ON `kasse_type` (`key`);--> statement-breakpoint
CREATE INDEX `kasse_type_active_idx` ON `kasse_type` (`isActive`);--> statement-breakpoint
CREATE TABLE `konto` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`kasseType` text(100) NOT NULL,
	`iban` text(50) NOT NULL,
	`bic` text(20) NOT NULL,
	`bankName` text(255) NOT NULL,
	`description` text(500),
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `konto_type_idx` ON `konto` (`kasseType`);--> statement-breakpoint
CREATE TABLE `order` (
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
	FOREIGN KEY (`drinkId`) REFERENCES `drink`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_user_idx` ON `order` (`userId`);--> statement-breakpoint
CREATE INDEX `order_drink_idx` ON `order` (`drinkId`);--> statement-breakpoint
CREATE INDEX `order_created_idx` ON `order` (`createdAt`);--> statement-breakpoint
CREATE TABLE `recurring_event` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`title` text(255) NOT NULL,
	`description` text(1000),
	`location` text(255) DEFAULT 'adH Rhenania',
	`type` text(100) DEFAULT 'Sonstige' NOT NULL,
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
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurring_event_type_idx` ON `recurring_event` (`type`);--> statement-breakpoint
CREATE INDEX `recurring_event_active_idx` ON `recurring_event` (`isActive`);--> statement-breakpoint
CREATE TABLE `role` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(50) NOT NULL,
	`description` text(255),
	`createdAt` integer DEFAULT (unixepoch()),
	`updatedAt` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_name_unique` ON `role` (`name`);--> statement-breakpoint
CREATE TABLE `semester_config` (
	`id` text(50) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`name` text(255) DEFAULT '' NOT NULL,
	`startDate` integer,
	`endDate` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `user_achievement` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`achievementId` text(255) NOT NULL,
	`unlockedAt` integer NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`notificationSent` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievementId`) REFERENCES `achievement`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_achievement_unique_idx` ON `user_achievement` (`userId`,`achievementId`);--> statement-breakpoint
CREATE INDEX `user_achievement_user_idx` ON `user_achievement` (`userId`);--> statement-breakpoint
CREATE INDEX `user_achievement_achievement_idx` ON `user_achievement` (`achievementId`);--> statement-breakpoint
CREATE INDEX `user_achievement_unlocked_idx` ON `user_achievement` (`unlockedAt`);--> statement-breakpoint
CREATE TABLE `user_preference` (
	`userId` text(255) NOT NULL,
	`key` text(100) NOT NULL,
	`value` text NOT NULL,
	`valueType` text DEFAULT 'json' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()),
	`updatedAt` integer DEFAULT (unixepoch()),
	PRIMARY KEY(`userId`, `key`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_pref_user_idx` ON `user_preference` (`userId`);--> statement-breakpoint
CREATE INDEX `user_pref_key_idx` ON `user_preference` (`key`);--> statement-breakpoint
CREATE TABLE `user_role` (
	`userId` text(255) NOT NULL,
	`roleId` text(255) NOT NULL,
	`assignedAt` integer DEFAULT (unixepoch()),
	`assignedBy` text(255),
	PRIMARY KEY(`userId`, `roleId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roleId`) REFERENCES `role`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_roles_user_id_idx` ON `user_role` (`userId`);--> statement-breakpoint
CREATE INDEX `user_roles_role_id_idx` ON `user_role` (`roleId`);--> statement-breakpoint
CREATE TABLE `user_stat` (
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
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255) NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text(255),
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `venue` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`shortName` text(255) NOT NULL,
	`fullAddress` text(500) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `venue_shortName_unique` ON `venue` (`shortName`);--> statement-breakpoint
CREATE UNIQUE INDEX `venue_short_name_idx` ON `venue` (`shortName`);--> statement-breakpoint
CREATE TABLE `verification_token` (
	`identifier` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
