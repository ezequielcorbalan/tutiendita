CREATE TABLE `pedidos` (
	`id` text PRIMARY KEY NOT NULL,
	`comprador_nombre` text NOT NULL,
	`nota` text DEFAULT '' NOT NULL,
	`medio_de_pago` text NOT NULL,
	`items` text NOT NULL,
	`total_monto` integer NOT NULL,
	`total_moneda` text NOT NULL,
	`estado` text NOT NULL,
	`creado_en` text NOT NULL,
	`actualizado_en` text NOT NULL,
	CONSTRAINT "pedidos_estado_check" CHECK("pedidos"."estado" IN ('nuevo', 'contactado', 'pagado', 'entregado', 'cancelado'))
);
--> statement-breakpoint
CREATE INDEX `pedidos_estado_idx` ON `pedidos` (`estado`);
