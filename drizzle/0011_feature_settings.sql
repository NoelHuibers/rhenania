ALTER TABLE `kasse_config` ADD `markupPercent` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `kasse_config` ADD `billRecipient` text DEFAULT 'members' NOT NULL;--> statement-breakpoint
ALTER TABLE `kasse_config` ADD `treasurerEmail` text(255);--> statement-breakpoint
ALTER TABLE `order` ADD `costPerUnit` real;