import { sql } from "drizzle-orm";
import { blob, check, index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Los de `IDIOMAS` del core (mismo criterio que los pasos del primer ingreso, más abajo). */
const IDIOMAS = ["es", "en", "pt"] as const;

/** Una sola fila por despliegue. */
export const tiendas = sqliteTable("tiendas", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  logoKey: text("logo_key"),
  moneda: text("moneda").notNull(),
  idioma: text("idioma", { enum: IDIOMAS }).notNull().default("es"),
  contactoWhatsapp: text("contacto_whatsapp"),
  contactoEmail: text("contacto_email"),
  dominio: text("dominio"),
  creadoEn: text("creado_en").notNull(),
  actualizadoEn: text("actualizado_en").notNull(),
});

export const categorias = sqliteTable("categorias", {
  id: text("id").primaryKey(),
  nombre: text("nombre").notNull(),
  slug: text("slug").notNull().unique(),
  padreId: text("padre_id"),
});

export const productos = sqliteTable(
  "productos",
  {
    id: text("id").primaryKey(),
    nombre: text("nombre").notNull(),
    slug: text("slug").notNull().unique(),
    descripcion: text("descripcion").notNull().default(""),
    precioMonto: integer("precio_monto").notNull(),
    precioMoneda: text("precio_moneda").notNull(),
    stock: integer("stock"),
    estado: text("estado", { enum: ["borrador", "publicado", "pausado"] }).notNull(),
    categoriaId: text("categoria_id").references(() => categorias.id),
    federar: integer("federar", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull(),
    creadoEn: text("creado_en").notNull(),
    actualizadoEn: text("actualizado_en").notNull(),
  },
  (t) => [
    index("productos_estado_idx").on(t.estado),
    check("productos_estado_check", sql`${t.estado} IN ('borrador', 'publicado', 'pausado')`),
  ],
);

export const imagenesProducto = sqliteTable(
  "imagenes_producto",
  {
    id: text("id").primaryKey(),
    productoId: text("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    orden: integer("orden").notNull(),
  },
  (t) => [index("imagenes_producto_producto_idx").on(t.productoId)],
);

// --- Acceso y primer ingreso ---

const PASOS_DEL_PRIMER_INGRESO = ["acceso", "nombre", "whatsapp", "transferencia", "producto"] as const;

/** Una sola fila (id = 1): existe si y solo si la tienda tiene dueño. */
export const acceso = sqliteTable(
  "acceso",
  {
    id: integer("id").primaryKey(),
    webauthnUserId: text("webauthn_user_id").notNull(),
    reclamadaEn: text("reclamada_en").notNull(),
    /** SHA-256 (hex) del código de recuperación vigente; null tras usarlo. */
    codigoRecuperacionHash: text("codigo_recuperacion_hash"),
    codigoRecuperacionCreadoEn: text("codigo_recuperacion_creado_en"),
    primerIngresoPaso: text("primer_ingreso_paso", { enum: PASOS_DEL_PRIMER_INGRESO }).notNull(),
    primerIngresoCompletadoEn: text("primer_ingreso_completado_en"),
  },
  (t) => [
    check("acceso_una_fila_check", sql`${t.id} = 1`),
    check(
      "acceso_paso_check",
      sql`${t.primerIngresoPaso} IN ('acceso', 'nombre', 'whatsapp', 'transferencia', 'producto')`,
    ),
  ],
);

export const origenesPermitidos = sqliteTable("origenes_permitidos", {
  origen: text("origen").primaryKey(),
  rpId: text("rp_id").notNull(),
  principal: integer("principal", { mode: "boolean" }).notNull(),
  agregadoEn: text("agregado_en").notNull(),
});

export const credencialesPasskey = sqliteTable("credenciales_passkey", {
  /** base64url, como lo manda el navegador. */
  id: text("id").primaryKey(),
  clavePublica: blob("clave_publica").notNull(),
  contador: integer("contador").notNull(),
  /** JSON con la lista de transportes. */
  transportes: text("transportes").notNull(),
  rpId: text("rp_id").notNull(),
  origen: text("origen").notNull(),
  tipoDispositivo: text("tipo_dispositivo").notNull(),
  respaldada: integer("respaldada", { mode: "boolean" }).notNull(),
  nombre: text("nombre").notNull(),
  creadaEn: text("creada_en").notNull(),
  ultimoUsoEn: text("ultimo_uso_en"),
});

/** El id de la sesión viaja solo en la cookie; acá va su SHA-256. */
export const sesiones = sqliteTable(
  "sesiones",
  {
    idHash: text("id_hash").primaryKey(),
    tipo: text("tipo", { enum: ["completa", "reclamo", "recuperacion"] }).notNull(),
    creadaEn: text("creada_en").notNull(),
    expiraEn: text("expira_en").notNull(),
    ultimoUsoEn: text("ultimo_uso_en").notNull(),
  },
  (t) => [
    index("sesiones_expira_en_idx").on(t.expiraEn),
    check("sesiones_tipo_check", sql`${t.tipo} IN ('completa', 'reclamo', 'recuperacion')`),
  ],
);

export const desafiosWebauthn = sqliteTable(
  "desafios_webauthn",
  {
    id: text("id").primaryKey(),
    desafio: text("desafio").notNull(),
    proposito: text("proposito", { enum: ["registro", "ingreso"] }).notNull(),
    sesionIdHash: text("sesion_id_hash"),
    /** `user.id` que se mandó en las opciones de registro (el navegador no lo devuelve). */
    webauthnUserId: text("webauthn_user_id"),
    expiraEn: text("expira_en").notNull(),
  },
  (t) => [check("desafios_webauthn_proposito_check", sql`${t.proposito} IN ('registro', 'ingreso')`)],
);

/** `clave` = `reclamo:<ip>` o `recuperacion:<ip>`; `ventana` = inicio de la ventana de 15 minutos. */
export const intentosFallidos = sqliteTable(
  "intentos_fallidos",
  {
    clave: text("clave").notNull(),
    ventana: text("ventana").notNull(),
    cantidad: integer("cantidad").notNull(),
  },
  (t) => [primaryKey({ columns: [t.clave, t.ventana] })],
);

export const mediosDePago = sqliteTable(
  "medios_de_pago",
  {
    tipo: text("tipo", { enum: ["whatsapp", "transferencia"] }).primaryKey(),
    activo: integer("activo", { mode: "boolean" }).notNull(),
    /** JSON validado en core. */
    configuracion: text("configuracion").notNull(),
    actualizadoEn: text("actualizado_en").notNull(),
  },
  (t) => [check("medios_de_pago_tipo_check", sql`${t.tipo} IN ('whatsapp', 'transferencia')`)],
);

/** La GitHub App propia de la tienda para actualizarla desde el panel. Una sola fila (`id` = 1). */
export const conexionGithub = sqliteTable(
  "conexion_github",
  {
    id: integer("id").primaryKey(),
    appId: integer("app_id").notNull(),
    slug: text("slug").notNull(),
    /** PEM que devuelve GitHub; quien accede a esta base ya es dueño de la tienda. */
    clavePrivada: text("clave_privada").notNull(),
    instalacionId: integer("instalacion_id"),
    repositorio: text("repositorio"),
    actualizadoEn: text("actualizado_en").notNull(),
  },
  (t) => [check("conexion_github_una_fila", sql`${t.id} = 1`)],
);
