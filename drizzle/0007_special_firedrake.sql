CREATE TABLE `fuchsen_bill_item` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billId` text(255) NOT NULL,
	`itemName` text(255) NOT NULL,
	`amount` integer NOT NULL,
	`pricePerItem` real NOT NULL,
	`totalPrice` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`billId`) REFERENCES `fuchsen_bill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fuchsen_bill_item_bill_idx` ON `fuchsen_bill_item` (`billId`);--> statement-breakpoint
CREATE TABLE `fuchsen_bill_period` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billNumber` text NOT NULL,
	`totalAmount` real DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`createdBy` text(255),
	`updatedAt` integer,
	`closedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fuchsen_bill_period_billNumber_unique` ON `fuchsen_bill_period` (`billNumber`);--> statement-breakpoint
CREATE INDEX `fuchsen_bill_period_number_idx` ON `fuchsen_bill_period` (`billNumber`);--> statement-breakpoint
CREATE INDEX `fuchsen_bill_period_dates_idx` ON `fuchsen_bill_period` (`createdAt`);--> statement-breakpoint
CREATE TABLE `fuchsen_bill` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`billPeriodId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`userName` text(255) NOT NULL,
	`status` text DEFAULT 'Unbezahlt' NOT NULL,
	`oldBillingAmount` real DEFAULT 0 NOT NULL,
	`itemsTotal` real NOT NULL,
	`total` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	`paidAt` integer,
	FOREIGN KEY (`billPeriodId`) REFERENCES `fuchsen_bill_period`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fuchsen_bill_period_idx` ON `fuchsen_bill` (`billPeriodId`);--> statement-breakpoint
CREATE INDEX `fuchsen_bill_user_idx` ON `fuchsen_bill` (`userId`);--> statement-breakpoint
CREATE INDEX `fuchsen_bill_status_idx` ON `fuchsen_bill` (`status`);--> statement-breakpoint
CREATE INDEX `fuchsen_bill_created_idx` ON `fuchsen_bill` (`createdAt`);--> statement-breakpoint
ALTER TABLE `fuchsen_order` ADD `billId` text(255);--> statement-breakpoint
CREATE INDEX `fuchsen_order_bill_idx` ON `fuchsen_order` (`billId`);