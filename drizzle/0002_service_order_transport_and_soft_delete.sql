ALTER TABLE `appointments` ADD `transportServiceId` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `transportPriceCents` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD `transportPaymentMethod` enum('pix','cash','card');--> statement-breakpoint
ALTER TABLE `appointments` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `services` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_transportServiceId_services_id_fk` FOREIGN KEY (`transportServiceId`) REFERENCES `services`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointments_deleted_idx` ON `appointments` (`deletedAt`);--> statement-breakpoint
CREATE INDEX `services_sort_order_idx` ON `services` (`sortOrder`);