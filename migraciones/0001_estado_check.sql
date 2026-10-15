-- Generada por drizzle-kit y ajustada a mano para D1: agrega el CHECK de productos.estado recreando la tabla.
-- D1 corre cada migración en una transacción con las foreign keys activas: `PRAGMA foreign_keys=OFF` no tiene
-- efecto y `DROP TABLE productos` dispararía el ON DELETE CASCADE sobre imagenes_producto. Por eso se respaldan
-- las imágenes antes del DROP y se restauran después del RENAME; defer_foreign_keys posterga el chequeo al commit.
PRAGMA defer_foreign_keys = on;--> statement-breakpoint
CREATE TABLE `__new_productos` (
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
	FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "productos_estado_check" CHECK("__new_productos"."estado" IN ('borrador', 'publicado', 'pausado'))
);
--> statement-breakpoint
INSERT INTO `__new_productos`("id", "nombre", "slug", "descripcion", "precio_monto", "precio_moneda", "stock", "estado", "categoria_id", "federar", "version", "creado_en", "actualizado_en") SELECT "id", "nombre", "slug", "descripcion", "precio_monto", "precio_moneda", "stock", "estado", "categoria_id", "federar", "version", "creado_en", "actualizado_en" FROM `productos`;--> statement-breakpoint
CREATE TABLE `__respaldo_imagenes_producto` AS SELECT `id`, `producto_id`, `key`, `orden` FROM `imagenes_producto`;--> statement-breakpoint
DROP TABLE `productos`;--> statement-breakpoint
ALTER TABLE `__new_productos` RENAME TO `productos`;--> statement-breakpoint
INSERT INTO `imagenes_producto`(`id`, `producto_id`, `key`, `orden`) SELECT `id`, `producto_id`, `key`, `orden` FROM `__respaldo_imagenes_producto` WHERE `id` NOT IN (SELECT `id` FROM `imagenes_producto`);--> statement-breakpoint
DROP TABLE `__respaldo_imagenes_producto`;--> statement-breakpoint
PRAGMA defer_foreign_keys = off;--> statement-breakpoint
CREATE UNIQUE INDEX `productos_slug_unique` ON `productos` (`slug`);--> statement-breakpoint
CREATE INDEX `productos_estado_idx` ON `productos` (`estado`);
