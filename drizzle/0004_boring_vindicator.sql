CREATE TABLE `member` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255),
	`status` text NOT NULL,
	`firstName` text(255) NOT NULL,
	`lastName` text(255) NOT NULL,
	`email` text(255),
	`street` text(255),
	`houseNumber` text(50),
	`addressLine2` text(255),
	`postalCode` text(20),
	`city` text(255),
	`country` text(100) DEFAULT 'Deutschland',
	`lettersOptOut` integer DEFAULT false NOT NULL,
	`addressNeedsUpdate` integer DEFAULT false NOT NULL,
	`notes` text(1000),
	`createdBy` text(255),
	`updatedBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `member_user_idx` ON `member` (`userId`);--> statement-breakpoint
CREATE INDEX `member_status_idx` ON `member` (`status`);--> statement-breakpoint
CREATE INDEX `member_email_idx` ON `member` (`email`);--> statement-breakpoint
CREATE INDEX `member_name_idx` ON `member` (`lastName`,`firstName`);--> statement-breakpoint
CREATE TABLE `semesterbeitrag_charge` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`runId` text(255) NOT NULL,
	`memberId` text(255) NOT NULL,
	`memberName` text(255) NOT NULL,
	`baseAmount` real NOT NULL,
	`mahnungAmount` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Offen' NOT NULL,
	`deliveryMethod` text,
	`emailSentAt` integer,
	`mahnungSentAt` integer,
	`paidAt` integer,
	`paidBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`runId`) REFERENCES `semesterbeitrag_run`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`paidBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `beitrag_charge_unique_idx` ON `semesterbeitrag_charge` (`runId`,`memberId`);--> statement-breakpoint
CREATE INDEX `beitrag_charge_run_idx` ON `semesterbeitrag_charge` (`runId`);--> statement-breakpoint
CREATE INDEX `beitrag_charge_member_idx` ON `semesterbeitrag_charge` (`memberId`);--> statement-breakpoint
CREATE INDEX `beitrag_charge_status_idx` ON `semesterbeitrag_charge` (`status`);--> statement-breakpoint
CREATE TABLE `semesterbeitrag_run` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`etaplanId` text(255) NOT NULL,
	`kostenpunktId` text(255) NOT NULL,
	`name` text(255) NOT NULL,
	`amount` real DEFAULT 28 NOT NULL,
	`mahnungFee` real DEFAULT 5 NOT NULL,
	`dueDate` integer NOT NULL,
	`status` text DEFAULT 'Offen' NOT NULL,
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`etaplanId`) REFERENCES `etaplan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kostenpunktId`) REFERENCES `kostenpunkt`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `beitrag_run_etaplan_idx` ON `semesterbeitrag_run` (`etaplanId`);--> statement-breakpoint
CREATE INDEX `beitrag_run_kp_idx` ON `semesterbeitrag_run` (`kostenpunktId`);--> statement-breakpoint
CREATE INDEX `beitrag_run_status_idx` ON `semesterbeitrag_run` (`status`);