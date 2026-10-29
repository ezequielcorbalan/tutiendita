import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const insertProduct = (id: string, status: string) =>
  env.DB.prepare(
    `INSERT INTO productos (id, nombre, slug, precio_monto, precio_moneda, estado, version, creado_en, actualizado_en)
     VALUES (?, 'P', ?, 100, 'ARS', ?, 1, '2026-10-14T10:00:00.000Z', '2026-10-14T10:00:00.000Z')`,
  )
    .bind(id, `slug-${id}`, status)
    .run();

const ACCESS_TABLES = [
  "acceso",
  "origenes_permitidos",
  "credenciales_passkey",
  "sesiones",
  "desafios_webauthn",
  "intentos_fallidos",
  "medios_de_pago",
];

describe("D1 access schema", () => {
  const insertAccess = (id: number, step = "acceso") =>
    env.DB.prepare(
      `INSERT INTO acceso (id, webauthn_user_id, reclamada_en, primer_ingreso_paso) VALUES (?, 'u', '2026-10-15T10:00:00.000Z', ?)`,
    )
      .bind(id, step)
      .run();

  it("acceso is a single row (id = 1) with a valid step", async () => {
    await env.DB.prepare("DELETE FROM acceso").run();
    await expect(insertAccess(2)).rejects.toThrow(/CHECK constraint failed/);
    await expect(insertAccess(1, "other")).rejects.toThrow(/CHECK constraint failed/);
    await insertAccess(1);
    await expect(insertAccess(1)).rejects.toThrow(/UNIQUE|PRIMARY KEY/);
    await env.DB.prepare("DELETE FROM acceso").run();
  });

  it.each([
    [
      "sesiones.tipo",
      "INSERT INTO sesiones (id_hash, tipo, creada_en, expira_en, ultimo_uso_en) VALUES ('h', 'admin', 'a', 'b', 'c')",
    ],
    [
      "desafios_webauthn.proposito",
      "INSERT INTO desafios_webauthn (id, desafio, proposito, expira_en) VALUES ('d', 'x', 'otro', 'b')",
    ],
    [
      "medios_de_pago.tipo",
      "INSERT INTO medios_de_pago (tipo, activo, configuracion, actualizado_en) VALUES ('bitcoin', 1, '{}', 'a')",
    ],
  ])("%s rejects values outside the allowed ones", async (_field, sql) => {
    await expect(env.DB.prepare(sql).run()).rejects.toThrow(/CHECK constraint failed/);
  });
});

describe("D1 schema: store language", () => {
  const insertStore = (id: string, language?: string) =>
    env.DB.prepare(
      `INSERT INTO tiendas (id, nombre, moneda, creado_en, actualizado_en${language ? ", idioma" : ""})
       VALUES (?, 'T', 'ARS', 'a', 'b'${language ? ", ?" : ""})`,
    )
      .bind(...(language ? [id, language] : [id]))
      .run();
  const languageOf = async (id: string) =>
    (await env.DB.prepare("SELECT idioma FROM tiendas WHERE id = ?").bind(id).first<{ idioma: string }>())
      ?.idioma;

  it("without a language it defaults to Spanish; accepts en and pt; rejects others", async () => {
    await env.DB.prepare("DELETE FROM tiendas").run();
    await insertStore("t-default");
    expect(await languageOf("t-default")).toBe("es");
    await insertStore("t-en", "en");
    await insertStore("t-pt", "pt");
    expect(await languageOf("t-pt")).toBe("pt");
    await expect(insertStore("t-fr", "fr")).rejects.toThrow(/CHECK constraint failed/);
    await env.DB.prepare("DELETE FROM tiendas").run();
  });
});

describe("D1 schema", () => {
  it("productos.estado rejects values outside borrador/publicado/pausado", async () => {
    await expect(insertProduct("status-odd", "eliminado")).rejects.toThrow(/CHECK constraint failed/);
  });

  it.each(["borrador", "publicado", "pausado"])("productos.estado accepts %s", async (status) => {
    await insertProduct(`status-${status}`, status);
    const row = await env.DB.prepare("SELECT estado FROM productos WHERE id = ?")
      .bind(`status-${status}`)
      .first<{ estado: string }>();
    expect(row?.estado).toBe(status);
  });

  it("migrations after the initial one preserve products, images, categories and the store", async () => {
    // Go back to a database with only the initial migration, load data and apply the rest.
    for (const table of [
      "imagenes_producto",
      "productos",
      "categorias",
      "tiendas",
      ...ACCESS_TABLES,
      "conexion_github",
      "valores_opcion",
      "opciones_producto",
      "plantillas_opcion",
      "imagenes_blob",
      "configuracion",
      "pedidos",
      "d1_migrations",
    ]) {
      await env.DB.prepare(`DROP TABLE IF EXISTS ${table}`).run();
    }
    const [initial, ...rest] = env.MIGRATIONS;
    if (initial === undefined) throw new Error("no migrations");
    expect(rest.length).toBeGreaterThan(0);
    await applyD1Migrations(env.DB, [initial]);

    await env.DB.prepare("INSERT INTO categorias (id, nombre, slug) VALUES ('c1', 'Mates', 'mates')").run();
    await insertProduct("p1", "publicado");
    await env.DB.prepare("UPDATE productos SET categoria_id = 'c1', stock = 3 WHERE id = 'p1'").run();
    await env.DB.prepare(
      "INSERT INTO imagenes_producto (id, producto_id, key, orden) VALUES ('i1', 'p1', 'a.png', 0)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO tiendas (id, nombre, moneda, creado_en, actualizado_en) VALUES ('t1', 'Ana', 'ARS', 'a', 'b')",
    ).run();

    await applyD1Migrations(env.DB, env.MIGRATIONS);

    const product = await env.DB.prepare("SELECT * FROM productos WHERE id = 'p1'").first<{
      estado: string;
      categoria_id: string;
      stock: number;
    }>();
    expect(product).toMatchObject({ estado: "publicado", categoria_id: "c1", stock: 3 });
    const images = await env.DB.prepare("SELECT id FROM imagenes_producto WHERE producto_id = 'p1'").all();
    expect(images.results).toEqual([{ id: "i1" }]);
    await expect(insertProduct("after", "eliminado")).rejects.toThrow(/CHECK constraint failed/);
    // 0003 adds the language without rewriting tiendas: the existing store stays in Spanish.
    const store = await env.DB.prepare("SELECT nombre, idioma FROM tiendas WHERE id = 't1'").first();
    expect(store).toEqual({ nombre: "Ana", idioma: "es" });
  });
});
