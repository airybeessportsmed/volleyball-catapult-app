CREATE TABLE `athletes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`teamId` int NOT NULL,
	`jerseyNumber` int,
	`position` varchar(50),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `athletes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `csvUploads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`uploadedBy` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileSize` int,
	`recordsImported` int,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `csvUploads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `performanceData` (
	`id` int AUTO_INCREMENT NOT NULL,
	`athleteId` int NOT NULL,
	`teamId` int NOT NULL,
	`date` timestamp NOT NULL,
	`sessionType` enum('practice','match') NOT NULL DEFAULT 'practice',
	`maxJumpHeight` decimal(10,2),
	`avgJumpHeight` decimal(10,2),
	`totalJumps` int,
	`avgAcceleration` decimal(10,2),
	`maxAcceleration` decimal(10,2),
	`totalDistance` decimal(10,2),
	`avgSpeed` decimal(10,2),
	`maxSpeed` decimal(10,2),
	`totalLoad` decimal(10,2),
	`avgLoad` decimal(10,2),
	`duration` int,
	`rawCsvData` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `performanceData_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`coachId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','coach','athlete') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `teamId` int;