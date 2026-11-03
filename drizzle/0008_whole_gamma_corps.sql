CREATE TABLE `plaid_items` (
	`item_id` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`institution_name` text,
	`cursor` text,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
