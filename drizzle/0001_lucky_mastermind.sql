CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`petId` int NOT NULL,
	`serviceId` int NOT NULL,
	`startAt` varchar(19) NOT NULL,
	`durationMinutes` int NOT NULL,
	`priceCents` int NOT NULL,
	`paymentMethod` enum('pix','cash','card','package') NOT NULL,
	`paymentStatus` enum('pending','paid') NOT NULL DEFAULT 'pending',
	`packageId` int,
	`appointmentStatus` enum('scheduled','confirmed','in_progress','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`externalCalendarId` varchar(255),
	`externalCalendarEventId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(32),
	`address` varchar(255),
	`email` varchar(320),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `packageServices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`packageId` int NOT NULL,
	`serviceId` int NOT NULL,
	`allowance` int NOT NULL,
	`used` int NOT NULL DEFAULT 0,
	CONSTRAINT `packageServices_id` PRIMARY KEY(`id`),
	CONSTRAINT `package_service_unique` UNIQUE(`packageId`,`serviceId`)
);
--> statement-breakpoint
CREATE TABLE `packageUsages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`packageId` int NOT NULL,
	`packageServiceId` int NOT NULL,
	`appointmentId` int NOT NULL,
	`usedAt` timestamp NOT NULL DEFAULT (now()),
	`reversedAt` timestamp,
	CONSTRAINT `packageUsages_id` PRIMARY KEY(`id`),
	CONSTRAINT `package_usage_appointment_unique` UNIQUE(`appointmentId`)
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`petId` int NOT NULL,
	`name` varchar(140) NOT NULL,
	`cadence` enum('monthly','biweekly') NOT NULL,
	`startDate` varchar(10) NOT NULL,
	`endDate` varchar(10) NOT NULL,
	`priceCents` int NOT NULL,
	`status` enum('active','closed') NOT NULL DEFAULT 'active',
	`paid` int NOT NULL DEFAULT 0,
	`paymentMethod` enum('pix','cash','card'),
	`closedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceType` enum('service','package') NOT NULL,
	`appointmentId` int,
	`packageId` int,
	`amountCents` int NOT NULL,
	`method` enum('pix','cash','card') NOT NULL,
	`paymentRecordStatus` enum('settled','voided') NOT NULL DEFAULT 'settled',
	`paidAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_appointment_unique` UNIQUE(`appointmentId`),
	CONSTRAINT `payments_package_unique` UNIQUE(`packageId`)
);
--> statement-breakpoint
CREATE TABLE `pets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`species` enum('dog','cat','rabbit') NOT NULL,
	`breed` varchar(120),
	`size` enum('small','medium','large','special') NOT NULL,
	`notes` text,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduleDayLocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`localDate` varchar(10) NOT NULL,
	CONSTRAINT `scheduleDayLocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduleDayLocks_localDate_unique` UNIQUE(`localDate`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`category` enum('bath','grooming','treatment','transport','other') NOT NULL,
	`size` enum('small','medium','large','special'),
	`priceCents` int NOT NULL DEFAULT 0,
	`durationMinutes` int NOT NULL DEFAULT 60,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_petId_pets_id_fk` FOREIGN KEY (`petId`) REFERENCES `pets`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_packageId_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packageServices` ADD CONSTRAINT `packageServices_packageId_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packageServices` ADD CONSTRAINT `packageServices_serviceId_services_id_fk` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packageUsages` ADD CONSTRAINT `packageUsages_packageId_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packageUsages` ADD CONSTRAINT `packageUsages_packageServiceId_packageServices_id_fk` FOREIGN KEY (`packageServiceId`) REFERENCES `packageServices`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packageUsages` ADD CONSTRAINT `packageUsages_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packages` ADD CONSTRAINT `packages_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `packages` ADD CONSTRAINT `packages_petId_pets_id_fk` FOREIGN KEY (`petId`) REFERENCES `pets`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_appointmentId_appointments_id_fk` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_packageId_packages_id_fk` FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pets` ADD CONSTRAINT `pets_clientId_clients_id_fk` FOREIGN KEY (`clientId`) REFERENCES `clients`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appointments_start_idx` ON `appointments` (`startAt`);--> statement-breakpoint
CREATE INDEX `appointments_pet_start_idx` ON `appointments` (`petId`,`startAt`);--> statement-breakpoint
CREATE INDEX `appointments_status_idx` ON `appointments` (`appointmentStatus`);--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`name`);--> statement-breakpoint
CREATE INDEX `clients_active_idx` ON `clients` (`active`);--> statement-breakpoint
CREATE INDEX `package_service_package_idx` ON `packageServices` (`packageId`);--> statement-breakpoint
CREATE INDEX `package_usage_package_idx` ON `packageUsages` (`packageId`);--> statement-breakpoint
CREATE INDEX `packages_pet_idx` ON `packages` (`petId`);--> statement-breakpoint
CREATE INDEX `packages_client_idx` ON `packages` (`clientId`);--> statement-breakpoint
CREATE INDEX `packages_status_end_idx` ON `packages` (`status`,`endDate`);--> statement-breakpoint
CREATE INDEX `payments_paid_at_idx` ON `payments` (`paidAt`);--> statement-breakpoint
CREATE INDEX `payments_status_idx` ON `payments` (`paymentRecordStatus`);--> statement-breakpoint
CREATE INDEX `pets_client_idx` ON `pets` (`clientId`);--> statement-breakpoint
CREATE INDEX `pets_name_idx` ON `pets` (`name`);--> statement-breakpoint
CREATE INDEX `services_active_idx` ON `services` (`active`);--> statement-breakpoint
CREATE INDEX `services_category_idx` ON `services` (`category`);