CREATE TABLE `quran_bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`surah_number` integer NOT NULL,
	`ayah` integer NOT NULL,
	`kind` text DEFAULT 'ayah' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quran_bookmarks_uq` ON `quran_bookmarks` (`surah_number`,`ayah`,`kind`);--> statement-breakpoint
CREATE TABLE `quran_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`surah_number` integer NOT NULL,
	`ayah` integer,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quran_notes_surah_idx` ON `quran_notes` (`surah_number`);--> statement-breakpoint
CREATE TABLE `quran_reading` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`surah_number` integer NOT NULL,
	`ayah` integer DEFAULT 1 NOT NULL,
	`page` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quran_reading_surah_uq` ON `quran_reading` (`surah_number`);