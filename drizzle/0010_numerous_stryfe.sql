CREATE TABLE `financePendingDismissals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceType` enum('service','package','hotel') NOT NULL,
	`sourceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `financePendingDismissals_id` PRIMARY KEY(`id`),
	CONSTRAINT `finance_pending_dismissals_source_unique` UNIQUE(`sourceType`,`sourceId`)
);
