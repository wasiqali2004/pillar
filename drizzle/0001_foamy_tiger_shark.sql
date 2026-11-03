CREATE TABLE `body_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_date` text NOT NULL,
	`steps` integer,
	`sleep_minutes` integer,
	`weight_grams` integer,
	`source` text DEFAULT 'ui' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_metrics_date_uq` ON `body_metrics` (`local_date`);--> statement-breakpoint
CREATE TABLE `business_revenue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_date` text NOT NULL,
	`revenue_cents` integer NOT NULL,
	`order_count` integer DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'shopify' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_revenue_date_source_uq` ON `business_revenue` (`local_date`,`source`);--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`metric` text NOT NULL,
	`target_value` real NOT NULL,
	`unit` text,
	`period` text DEFAULT 'month' NOT NULL,
	`direction` text DEFAULT 'at_least' NOT NULL,
	`manual_progress` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`symbol` text NOT NULL,
	`label` text,
	`shares` real NOT NULL,
	`cost_basis_cents` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holdings_symbol_uq` ON `holdings` (`symbol`);--> statement-breakpoint
CREATE TABLE `prayer_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`local_date` text NOT NULL,
	`prayer` text NOT NULL,
	`prayed_at` text NOT NULL,
	`source` text DEFAULT 'ui' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prayer_logs_date_prayer_uq` ON `prayer_logs` (`local_date`,`prayer`);--> statement-breakpoint
CREATE INDEX `prayer_logs_date_idx` ON `prayer_logs` (`local_date`);--> statement-breakpoint
CREATE TABLE `price_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`price_cents` integer NOT NULL,
	`change_pct` real,
	`currency` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `surah_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`surah_number` integer NOT NULL,
	`name` text NOT NULL,
	`ayah_count` integer NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`ayahs_done` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `surah_progress_number_uq` ON `surah_progress` (`surah_number`);