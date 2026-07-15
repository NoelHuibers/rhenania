CREATE TABLE `einnahme` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`kostenpunktId` text(255) NOT NULL,
	`etaplanId` text(255) NOT NULL,
	`description` text(500) NOT NULL,
	`amount` real NOT NULL,
	`incomeDate` integer NOT NULL,
	`bookedBy` text(255),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`etaplanId`) REFERENCES `etaplan`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bookedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kostenpunktId`) REFERENCES `kostenpunkt`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `einnahme_kostenpunkt_idx` ON `einnahme` (`kostenpunktId`);--> statement-breakpoint
CREATE INDEX `einnahme_etaplan_idx` ON `einnahme` (`etaplanId`);