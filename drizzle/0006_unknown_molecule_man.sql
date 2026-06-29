ALTER TABLE `inventory` ADD `kind` text DEFAULT 'routine' NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory` ADD `eventId` text(255) REFERENCES event(id);--> statement-breakpoint
ALTER TABLE `inventory` ADD `eventName` text(255);--> statement-breakpoint
ALTER TABLE `inventory` ADD `eventDate` integer;--> statement-breakpoint
CREATE INDEX `inventory_event_idx` ON `inventory` (`eventId`);