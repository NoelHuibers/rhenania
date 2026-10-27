CREATE INDEX `bill_user_status_idx` ON `bill` (`userId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `bill_user_nocase_idx` ON `bill` ("userId" COLLATE NOCASE);--> statement-breakpoint
CREATE INDEX `order_drink_created_idx` ON `order` (`drinkId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_user_created_idx` ON `order` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `order_unbilled_user_idx` ON `order` (`userId`,`createdAt`) WHERE "order"."inBill" = 0;--> statement-breakpoint
CREATE INDEX `order_unbilled_created_idx` ON `order` (`createdAt`) WHERE "order"."inBill" = 0;