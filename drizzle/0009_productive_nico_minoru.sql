CREATE TABLE `plaid_investment_holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` text NOT NULL,
	`account_id` text NOT NULL,
	`account_name` text,
	`symbol` text,
	`shares` real NOT NULL,
	`cost_basis_cents` integer,
	`price_cents` integer,
	`value_cents` integer,
	`currency` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `plaid_items`(`item_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plaid_holdings_account_symbol_uq` ON `plaid_investment_holdings` (`item_id`,`account_id`,`symbol`);--> statement-breakpoint
CREATE INDEX `plaid_holdings_item_idx` ON `plaid_investment_holdings` (`item_id`);