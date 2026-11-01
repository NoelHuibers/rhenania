CREATE TABLE `booking_account` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `booking_account_name_idx` ON `booking_account` (`name`);--> statement-breakpoint
-- The accounts that were hard-coded until now; CC, AKN and CBesuch were the chips.
INSERT INTO `booking_account` (`id`, `name`, `pinned`, `sortOrder`) VALUES
	(lower(hex(randomblob(16))), 'CC', 1, 0),
	(lower(hex(randomblob(16))), 'AKN', 1, 1),
	(lower(hex(randomblob(16))), 'CBesuch', 1, 2),
	(lower(hex(randomblob(16))), 'AHV', 0, 3),
	(lower(hex(randomblob(16))), 'RC', 0, 4),
	(lower(hex(randomblob(16))), 'SC', 0, 5),
	(lower(hex(randomblob(16))), 'Stiftungsfest', 0, 6),
	(lower(hex(randomblob(16))), 'Nikolausbowle', 0, 7);
