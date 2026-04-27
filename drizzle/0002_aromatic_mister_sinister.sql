CREATE TABLE `rhenania_event_type` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_event_type_key_unique` ON `rhenania_event_type` (`key`);--> statement-breakpoint
CREATE INDEX `event_type_active_idx` ON `rhenania_event_type` (`isActive`);--> statement-breakpoint
CREATE TABLE `rhenania_homepage_section` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_homepage_section_key_unique` ON `rhenania_homepage_section` (`key`);--> statement-breakpoint
CREATE INDEX `homepage_section_active_idx` ON `rhenania_homepage_section` (`isActive`);--> statement-breakpoint
CREATE TABLE `rhenania_kasse_type` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`key` text(100) NOT NULL,
	`label` text(255) NOT NULL,
	`displayOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rhenania_kasse_type_key_unique` ON `rhenania_kasse_type` (`key`);--> statement-breakpoint
CREATE INDEX `kasse_type_active_idx` ON `rhenania_kasse_type` (`isActive`);--> statement-breakpoint
ALTER TABLE `rhenania_event` ALTER COLUMN "type" TO "type" text(100) NOT NULL DEFAULT 'Sonstige';--> statement-breakpoint
ALTER TABLE `rhenania_recurring_event` ALTER COLUMN "type" TO "type" text(100) NOT NULL DEFAULT 'Sonstige';--> statement-breakpoint
ALTER TABLE `rhenania_homepage_image` ALTER COLUMN "section" TO "section" text(100) NOT NULL;--> statement-breakpoint
ALTER TABLE `rhenania_konto` ALTER COLUMN "kasseType" TO "kasseType" text(100) NOT NULL;
