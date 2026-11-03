CREATE TABLE `oauth_tokens` (
	`provider` text PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text,
	`expires_at` text NOT NULL,
	`scope` text,
	`connected_at` text NOT NULL,
	`updated_at` text NOT NULL
);
