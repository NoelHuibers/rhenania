ALTER TABLE `inventory_item` ADD `isCounted` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill (#221): every closed row holds the count it was closed with. A
-- running inventory's row only holds a count when a quick save changed it
-- from the opening stock; opening rows and purchase-only quick saves keep
-- countedStock = previousStock and stay "not counted".
UPDATE `inventory_item` SET `isCounted` = 1
WHERE `inventoryId` IN (SELECT `id` FROM `inventory` WHERE `status` = 'closed')
	OR `countedStock` <> `previousStock`;
