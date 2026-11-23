ALTER TABLE `hotelStays` ADD `calendarId` varchar(255);--> statement-breakpoint
ALTER TABLE `hotelStays` ADD `calendarEventId` varchar(255);--> statement-breakpoint
ALTER TABLE `hotelStays` ADD CONSTRAINT `hotel_stays_calendar_event_unique` UNIQUE(`calendarEventId`);