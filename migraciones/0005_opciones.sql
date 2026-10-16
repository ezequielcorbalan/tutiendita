-- Generada por drizzle-kit (reordenada: opciones_producto antes que valores_opcion). Solo crea tablas:
-- los productos y categorías existentes quedan sin variantes.
CREATE TABLE `plantillas_opcion` (
	`id` text PRIMARY KEY NOT NULL,
	`categoria_id` text NOT NULL,
	`nombre` text NOT NULL,
	`valores_json` text NOT NULL,
	`orden` integer NOT NULL,
	FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `plantillas_opcion_categoria_idx` ON `plantillas_opcion` (`categoria_id`);
--> statement-breakpoint
CREATE TABLE `opciones_producto` (
	`id` text PRIMARY KEY NOT NULL,
	`producto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`orden` integer NOT NULL,
	FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `opciones_producto_producto_idx` ON `opciones_producto` (`producto_id`);
--> statement-breakpoint
CREATE TABLE `valores_opcion` (
	`id` text PRIMARY KEY NOT NULL,
	`opcion_id` text NOT NULL,
	`etiqueta` text NOT NULL,
	`ajuste_precio` integer DEFAULT 0 NOT NULL,
	`orden` integer NOT NULL,
	FOREIGN KEY (`opcion_id`) REFERENCES `opciones_producto`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `valores_opcion_opcion_idx` ON `valores_opcion` (`opcion_id`);
