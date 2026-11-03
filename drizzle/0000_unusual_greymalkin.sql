CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`duration_sec` integer,
	`distance_m` real,
	`started_at` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`raw` text
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`row_id` integer,
	`payload` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text,
	`model` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `habit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habit_id` integer NOT NULL,
	`logged_at` text NOT NULL,
	`local_date` text NOT NULL,
	`value` real,
	`source` text DEFAULT 'ui' NOT NULL,
	`note` text,
	FOREIGN KEY (`habit_id`) REFERENCES `habits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `habit_logs_habit_date_uq` ON `habit_logs` (`habit_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `habit_logs_date_idx` ON `habit_logs` (`local_date`);--> statement-breakpoint
CREATE TABLE `habits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cadence` text DEFAULT 'daily' NOT NULL,
	`target_count` integer DEFAULT 1 NOT NULL,
	`unit` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `money_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`amount_cents` integer NOT NULL,
	`direction` text NOT NULL,
	`category` text,
	`occurred_on` text NOT NULL,
	`note` text,
	`source` text DEFAULT 'ui' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `money_occurred_idx` ON `money_entries` (`occurred_on`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`source` text PRIMARY KEY NOT NULL,
	`cursor` text,
	`last_run_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`for_date` text NOT NULL,
	`done_at` text,
	`carried_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tasks_for_date_idx` ON `tasks` (`for_date`);