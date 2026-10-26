CREATE TABLE `control_tenant_provisioning` (
	`slug` text(100) PRIMARY KEY NOT NULL,
	`displayName` text(255) NOT NULL,
	`dbName` text(64) NOT NULL,
	`primaryHostname` text(255),
	`firstAdminEmail` text(255),
	`step` text DEFAULT 'requested' NOT NULL,
	`dbUrl` text,
	`dbAuthToken` text,
	`tenantId` text(255),
	`lastError` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`leaseUntil` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`completedAt` integer
);
--> statement-breakpoint
ALTER TABLE `control_tenant` ADD `configVersion` integer DEFAULT 0 NOT NULL;