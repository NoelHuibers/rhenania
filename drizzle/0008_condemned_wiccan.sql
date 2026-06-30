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
CREATE TABLE `fuchsen_billing_config` (
	`id` text(50) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	`senderName` text(255) DEFAULT '' NOT NULL,
	`senderStreet` text(255) DEFAULT '' NOT NULL,
	`senderCity` text(255) DEFAULT '' NOT NULL,
	`location` text(255) DEFAULT '' NOT NULL,
	`iban` text(50) DEFAULT '' NOT NULL,
	`accountHolder` text(255) DEFAULT '' NOT NULL,
	`paypalBaseUrl` text(500) DEFAULT '' NOT NULL,
	`paymentDueDays` integer DEFAULT 14 NOT NULL,
	`updatedAt` integer,
	`updatedBy` text(255),
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
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
CREATE TABLE `fuchsen_item` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`price` real NOT NULL,
	`description` text(500),
	`picture` text,
	`isCurrentlyAvailable` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE INDEX `fuchsen_item_name_idx` ON `fuchsen_item` (`name`);--> statement-breakpoint
CREATE INDEX `fuchsen_item_available_idx` ON `fuchsen_item` (`isCurrentlyAvailable`);--> statement-breakpoint
CREATE TABLE `fuchsen_order` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`userId` text(255) NOT NULL,
	`userName` text(255) NOT NULL,
	`itemId` text(255) NOT NULL,
	`itemName` text(255) NOT NULL,
	`amount` integer NOT NULL,
	`pricePerUnit` real NOT NULL,
	`total` real NOT NULL,
	`status` text DEFAULT 'Offen' NOT NULL,
	`billId` text(255),
	`paidAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`itemId`) REFERENCES `fuchsen_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fuchsen_order_user_idx` ON `fuchsen_order` (`userId`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_item_idx` ON `fuchsen_order` (`itemId`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_status_idx` ON `fuchsen_order` (`status`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_bill_idx` ON `fuchsen_order` (`billId`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_created_idx` ON `fuchsen_order` (`createdAt`);