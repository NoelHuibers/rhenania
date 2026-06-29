ALTER TABLE `member` ADD `externalId` text(100);--> statement-breakpoint
ALTER TABLE `member` ADD `title` text(255);--> statement-breakpoint
ALTER TABLE `member` ADD `mobile` text(100);--> statement-breakpoint
ALTER TABLE `member` ADD `phonePrivate` text(100);--> statement-breakpoint
ALTER TABLE `member` ADD `phonePrivate2` text(100);--> statement-breakpoint
ALTER TABLE `member` ADD `email2` text(255);--> statement-breakpoint
ALTER TABLE `member` ADD `email3` text(255);--> statement-breakpoint
ALTER TABLE `member` ADD `company` text(255);--> statement-breakpoint
ALTER TABLE `member` ADD `phoneWork` text(100);--> statement-breakpoint
ALTER TABLE `member` ADD `phoneWork2` text(100);--> statement-breakpoint
ALTER TABLE `member` ADD `birthday` text(50);--> statement-breakpoint
ALTER TABLE `member` ADD `forwarding` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `member` ADD `extra` text;--> statement-breakpoint
CREATE INDEX `member_external_idx` ON `member` (`externalId`);