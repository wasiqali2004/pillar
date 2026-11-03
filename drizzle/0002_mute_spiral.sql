ALTER TABLE `money_entries` ADD `import_fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `money_import_fingerprint_uq` ON `money_entries` (`import_fingerprint`);