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
