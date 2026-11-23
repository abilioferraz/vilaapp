CREATE TABLE `hotelStays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`petId` int NOT NULL,
	`petSize` enum('small','medium','large','special') NOT NULL,
	`checkInDate` varchar(10) NOT NULL,
	`checkOutDate` varchar(10) NOT NULL,
	`dailyRateCents` int NOT NULL,
	`totalCents` int NOT NULL,
	`hotelStayStatus` enum('reserved','checked_in','completed') NOT NULL DEFAULT 'reserved',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hotelStays_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `sourceType` enum('service','package','hotel') NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `hotelStayId` int;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_hotel_stay_unique` UNIQUE(`hotelStayId`);--> statement-breakpoint
ALTER TABLE `hotelStays` ADD CONSTRAINT `hotelStays_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hotelStays` ADD CONSTRAINT `hotelStays_petId_pets_id_fk` FOREIGN KEY (`petId`) REFERENCES `pets`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `hotel_stays_client_idx` ON `hotelStays` (`clientId`);--> statement-breakpoint
CREATE INDEX `hotel_stays_pet_idx` ON `hotelStays` (`petId`);--> statement-breakpoint
CREATE INDEX `hotel_stays_dates_idx` ON `hotelStays` (`checkInDate`,`checkOutDate`);--> statement-breakpoint
CREATE INDEX `hotel_stays_status_idx` ON `hotelStays` (`hotelStayStatus`);--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_hotelStayId_hotelStays_id_fk` FOREIGN KEY (`hotelStayId`) REFERENCES `hotelStays`(`id`) ON DELETE restrict ON UPDATE no action;