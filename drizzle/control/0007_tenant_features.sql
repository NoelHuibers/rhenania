CREATE TABLE `control_tenant_feature` (
	`tenantId` text(255) NOT NULL,
	`key` text(100) NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`updatedAt` integer NOT NULL,
	`updatedBy` text(255),
	PRIMARY KEY(`tenantId`, `key`),
	FOREIGN KEY (`tenantId`) REFERENCES `control_tenant`(`id`) ON UPDATE no action ON DELETE cascade
);
