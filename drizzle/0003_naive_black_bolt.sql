CREATE TABLE `workout_exercises` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workout_id` integer NOT NULL,
	`name` text NOT NULL,
	`muscle_group` text NOT NULL,
	`sets` integer,
	`reps` integer,
	`load_grams` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_idx` ON `workout_exercises` (`workout_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_date` text NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`source` text DEFAULT 'ui' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workouts_date_idx` ON `workouts` (`local_date`);