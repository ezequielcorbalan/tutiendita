-- Hand-written in drizzle-kit style. ADD COLUMN does not rewrite the table: existing stores stay enabled.
ALTER TABLE `tiendas` ADD `latido_activo` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tiendas` ADD `latido_en` text;
