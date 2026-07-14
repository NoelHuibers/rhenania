CREATE TABLE `member_status` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`beitragspflichtig` integer DEFAULT false NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_status_key_unique` ON `member_status` (`key`);--> statement-breakpoint
CREATE INDEX `member_status_active_idx` ON `member_status` (`isActive`);