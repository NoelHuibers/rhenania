CREATE TABLE `control_super_admin` (
	`userId` text(255) PRIMARY KEY NOT NULL,
	`grantedAt` integer NOT NULL,
	`grantedBy` text(255),
	`reason` text(500)
);
