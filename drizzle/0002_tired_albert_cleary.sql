CREATE TABLE `etaplan` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`semesterType` text NOT NULL,
	`year` integer NOT NULL,
	`startDate` integer,
	`endDate` integer,
	`status` text DEFAULT 'Aktiv' NOT NULL,
	`notes` text(1000),
	`createdBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `etaplan_status_idx` ON `etaplan` (`status`);--> statement-breakpoint
CREATE INDEX `etaplan_year_idx` ON `etaplan` (`year`);--> statement-breakpoint
CREATE TABLE `kostenerstattung` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`kostenpunktId` text(255) NOT NULL,
	`etaplanId` text(255) NOT NULL,
	`source` text DEFAULT 'Antrag' NOT NULL,
	`status` text DEFAULT 'Eingereicht' NOT NULL,
	`description` text(500) NOT NULL,
	`amount` real NOT NULL,
	`submittedBy` text(255),
	`recipientName` text(255) NOT NULL,
	`iban` text(50),
	`receiptUrl` text,
	`receiptName` text(255),
	`expenseDate` integer NOT NULL,
	`approvedBy` text(255),
	`approvedAt` integer,
	`paidBy` text(255),
	`paidAt` integer,
	`rejectedBy` text(255),
	`rejectedAt` integer,
	`rejectionReason` text(500),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`etaplanId`) REFERENCES `etaplan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submittedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approvedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`paidBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rejectedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kostenpunktId`) REFERENCES `kostenpunkt`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `erstattung_kostenpunkt_idx` ON `kostenerstattung` (`kostenpunktId`);--> statement-breakpoint
CREATE INDEX `erstattung_etaplan_idx` ON `kostenerstattung` (`etaplanId`);--> statement-breakpoint
CREATE INDEX `erstattung_status_idx` ON `kostenerstattung` (`status`);--> statement-breakpoint
CREATE INDEX `erstattung_submitter_idx` ON `kostenerstattung` (`submittedBy`);--> statement-breakpoint
CREATE INDEX `erstattung_etaplan_status_idx` ON `kostenerstattung` (`etaplanId`,`status`);--> statement-breakpoint
CREATE TABLE `kostenpunkt_position` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`kostenpunktId` text(255) NOT NULL,
	`bemerkung` text(500),
	`ausgaben` real DEFAULT 0 NOT NULL,
	`einnahmen` real DEFAULT 0 NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`kostenpunktId`) REFERENCES `kostenpunkt`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `position_kostenpunkt_idx` ON `kostenpunkt_position` (`kostenpunktId`);--> statement-breakpoint
CREATE TABLE `kostenpunkt` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`etaplanId` text(255) NOT NULL,
	`category` text(255) NOT NULL,
	`categoryOrder` integer DEFAULT 0 NOT NULL,
	`name` text(255) NOT NULL,
	`description` text(1000),
	`budget` real DEFAULT 0 NOT NULL,
	`income` real DEFAULT 0 NOT NULL,
	`eventId` text(255),
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`etaplanId`) REFERENCES `etaplan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`eventId`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `kostenpunkt_etaplan_idx` ON `kostenpunkt` (`etaplanId`);--> statement-breakpoint
CREATE INDEX `kostenpunkt_event_idx` ON `kostenpunkt` (`eventId`);--> statement-breakpoint
CREATE INDEX `kostenpunkt_category_idx` ON `kostenpunkt` (`etaplanId`,`categoryOrder`);--> statement-breakpoint
CREATE TABLE `user_payment_info` (
	`userId` text(255) PRIMARY KEY NOT NULL,
	`accountHolder` text(255) NOT NULL,
	`iban` text(50) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
