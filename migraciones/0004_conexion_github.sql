CREATE TABLE `conexion_github` (
	`id` integer PRIMARY KEY NOT NULL,
	`app_id` integer NOT NULL,
	`slug` text NOT NULL,
	`clave_privada` text NOT NULL,
	`instalacion_id` integer,
	`repositorio` text,
	`actualizado_en` text NOT NULL,
	CONSTRAINT "conexion_github_una_fila" CHECK("conexion_github"."id" = 1)
);
