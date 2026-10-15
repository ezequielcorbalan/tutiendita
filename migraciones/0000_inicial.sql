CREATE TABLE `categorias` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`slug` text NOT NULL,
	`padre_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categorias_slug_unique` ON `categorias` (`slug`);--> statement-breakpoint
CREATE TABLE `imagenes_producto` (
	`id` text PRIMARY KEY NOT NULL,
	`producto_id` text NOT NULL,
	`key` text NOT NULL,
	`orden` integer NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `imagenes_producto_producto_idx` ON `imagenes_producto` (`producto_id`);--> statement-breakpoint
CREATE TABLE `productos` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`slug` text NOT NULL,
	`descripcion` text DEFAULT '' NOT NULL,
	`precio_monto` integer NOT NULL,
	`precio_moneda` text NOT NULL,
	`stock` integer,
	`estado` text NOT NULL,
	`categoria_id` text,
	`federar` integer DEFAULT false NOT NULL,
	`version` integer NOT NULL,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL,
	FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productos_slug_unique` ON `productos` (`slug`);--> statement-breakpoint
CREATE INDEX `productos_estado_idx` ON `productos` (`estado`);--> statement-breakpoint
CREATE TABLE `tiendas` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text DEFAULT '' NOT NULL,
	`logo_key` text,
	`moneda` text NOT NULL,
	`contacto_whatsapp` text,
	`contacto_email` text,
	`dominio` text,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL
);
