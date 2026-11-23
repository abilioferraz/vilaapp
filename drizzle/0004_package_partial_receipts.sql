ALTER TABLE `payments` DROP FOREIGN KEY `payments_packageId_packages_id_fk`;--> statement-breakpoint
ALTER TABLE `payments` DROP INDEX `payments_package_unique`;--> statement-breakpoint
ALTER TABLE `payments` ADD `idempotencyKey` varchar(64);--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_idempotency_unique` UNIQUE(`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `payments_package_idx` ON `payments` (`packageId`);--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_packageId_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION;
