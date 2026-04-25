CREATE TABLE `control_tenant_auth_config` (
	`tenantId` text(255) PRIMARY KEY NOT NULL,
	`emailPasswordEnabled` integer DEFAULT true NOT NULL,
	`microsoftEnabled` integer DEFAULT false NOT NULL,
	`azureClientId` text(255),
	`azureClientSecret` text,
	`azureTenantId` text(255),
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `control_tenant_domain` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tenantId` text(255) NOT NULL,
	`hostname` text(255) NOT NULL,
	`isPrimary` integer DEFAULT false NOT NULL,
	`isCustom` integer DEFAULT true NOT NULL,
	`verifiedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`tenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_tenant_domain_hostname_unique` ON `control_tenant_domain` (`hostname`);--> statement-breakpoint
CREATE INDEX `tenant_domain_tenant_idx` ON `control_tenant_domain` (`tenantId`);--> statement-breakpoint
CREATE TABLE `control_tenant_membership` (
	`userId` text(255) NOT NULL,
	`tenantId` text(255) NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joinedAt` integer NOT NULL,
	PRIMARY KEY(`userId`, `tenantId`),
	FOREIGN KEY (`tenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenant_membership_user_idx` ON `control_tenant_membership` (`userId`);--> statement-breakpoint
CREATE INDEX `tenant_membership_tenant_idx` ON `control_tenant_membership` (`tenantId`);--> statement-breakpoint
CREATE TABLE `control_tenant` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`slug` text(100) NOT NULL,
	`displayName` text(255) NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`dbUrl` text NOT NULL,
	`dbAuthToken` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_tenant_slug_unique` ON `control_tenant` (`slug`);