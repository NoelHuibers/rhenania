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
	`paidAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`itemId`) REFERENCES `fuchsen_item`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fuchsen_order_user_idx` ON `fuchsen_order` (`userId`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_item_idx` ON `fuchsen_order` (`itemId`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_status_idx` ON `fuchsen_order` (`status`);--> statement-breakpoint
CREATE INDEX `fuchsen_order_created_idx` ON `fuchsen_order` (`createdAt`);