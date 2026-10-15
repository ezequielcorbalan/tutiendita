CREATE TABLE `acceso` (
	`id` integer PRIMARY KEY NOT NULL,
	`webauthn_user_id` text NOT NULL,
	`reclamada_en` text NOT NULL,
	`codigo_recuperacion_hash` text,
	`codigo_recuperacion_creado_en` text,
	`primer_ingreso_paso` text NOT NULL,
	`primer_ingreso_completado_en` text,
	CONSTRAINT "acceso_una_fila_check" CHECK("acceso"."id" = 1),
	CONSTRAINT "acceso_paso_check" CHECK("acceso"."primer_ingreso_paso" IN ('acceso', 'nombre', 'whatsapp', 'transferencia', 'producto'))
);
--> statement-breakpoint
CREATE TABLE `credenciales_passkey` (
	`id` text PRIMARY KEY NOT NULL,
	`clave_publica` blob NOT NULL,
	`contador` integer NOT NULL,
	`transportes` text NOT NULL,
	`rp_id` text NOT NULL,
	`origen` text NOT NULL,
	`tipo_dispositivo` text NOT NULL,
	`respaldada` integer NOT NULL,
	`nombre` text NOT NULL,
	`creada_en` text NOT NULL,
	`ultimo_uso_en` text
);
--> statement-breakpoint
CREATE TABLE `desafios_webauthn` (
	`id` text PRIMARY KEY NOT NULL,
	`desafio` text NOT NULL,
	`proposito` text NOT NULL,
	`sesion_id_hash` text,
	`webauthn_user_id` text,
	`expira_en` text NOT NULL,
	CONSTRAINT "desafios_webauthn_proposito_check" CHECK("desafios_webauthn"."proposito" IN ('registro', 'ingreso'))
);
--> statement-breakpoint
CREATE TABLE `intentos_fallidos` (
	`clave` text NOT NULL,
	`ventana` text NOT NULL,
	`cantidad` integer NOT NULL,
	PRIMARY KEY(`clave`, `ventana`)
);
--> statement-breakpoint
CREATE TABLE `medios_de_pago` (
	`tipo` text PRIMARY KEY NOT NULL,
	`activo` integer NOT NULL,
	`configuracion` text NOT NULL,
	`actualizado_en` text NOT NULL,
	CONSTRAINT "medios_de_pago_tipo_check" CHECK("medios_de_pago"."tipo" IN ('whatsapp', 'transferencia'))
);
--> statement-breakpoint
CREATE TABLE `origenes_permitidos` (
	`origen` text PRIMARY KEY NOT NULL,
	`rp_id` text NOT NULL,
	`principal` integer NOT NULL,
	`agregado_en` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sesiones` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`creada_en` text NOT NULL,
	`expira_en` text NOT NULL,
	`ultimo_uso_en` text NOT NULL,
	CONSTRAINT "sesiones_tipo_check" CHECK("sesiones"."tipo" IN ('completa', 'reclamo', 'recuperacion'))
);
--> statement-breakpoint
CREATE INDEX `sesiones_expira_en_idx` ON `sesiones` (`expira_en`);