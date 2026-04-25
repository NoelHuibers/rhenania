CREATE TABLE `control_account` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`accountId` text(255) NOT NULL,
	`providerId` text(255) NOT NULL,
	`userId` text(255) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text(255),
	`password` text(255),
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `control_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `control_account` (`userId`);--> statement-breakpoint
CREATE TABLE `control_password_reset_token` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`token` text(255) NOT NULL,
	`expires` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_password_reset_token_token_unique` ON `control_password_reset_token` (`token`);--> statement-breakpoint
CREATE INDEX `password_reset_email_idx` ON `control_password_reset_token` (`email`);--> statement-breakpoint
CREATE INDEX `password_reset_token_idx` ON `control_password_reset_token` (`token`);--> statement-breakpoint
CREATE TABLE `control_session` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text(255) NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text(255),
	`userAgent` text(255),
	`userId` text(255) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `control_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_session_token_unique` ON `control_session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `control_session` (`userId`);--> statement-breakpoint
CREATE TABLE `control_user` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255),
	`email` text(255) NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text(255),
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_user_email_unique` ON `control_user` (`email`);--> statement-breakpoint
CREATE TABLE `control_verification` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`identifier` text(255) NOT NULL,
	`value` text(255) NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
