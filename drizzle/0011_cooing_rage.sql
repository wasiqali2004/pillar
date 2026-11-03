ALTER TABLE `workouts` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_external_id_uq` ON `workouts` (`external_id`);