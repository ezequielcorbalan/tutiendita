-- Generada por drizzle-kit; el CHECK de columna se agregó a mano (drizzle solo sabe hacer CHECK de tabla, que
-- obligaría a recrear tiendas). ADD COLUMN no reescribe la tabla: las tiendas existentes quedan en español.
ALTER TABLE `tiendas` ADD `idioma` text DEFAULT 'es' NOT NULL CHECK (`idioma` IN ('es', 'en', 'pt'));
