#!/usr/bin/env node
// Crea la base D1 de la tienda si todavía no existe. Corre en `npm run deploy` antes de las migraciones:
// el aprovisionamiento automático de wrangler solo ocurre dentro de `wrangler deploy`, y
// `wrangler d1 migrations apply --remote` falla con "Couldn't find a D1 DB named ..." si la base no está.
//
//   node scripts/preparar-d1.mjs     (desde la carpeta que tiene wrangler.jsonc)
//
// Sin dependencias: lee wrangler.jsonc, corre `wrangler d1 info <base>` y, solo si wrangler dice que no
// la encuentra, `wrangler d1 create <base>`. Cualquier otro error corta el deploy. TIENDITA_WRANGLER_BIN
// reemplaza el wrangler instalado (lo usan los tests con un wrangler falso).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const BINDING = "DB";
const raiz = process.cwd();

/** Quita comentarios (// y /* *\/) y comas finales de un JSONC, respetando los strings. */
function sinComentarios(texto) {
  let salida = "";
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== '"') j += texto[j] === "\\" ? 2 : 1;
      salida += texto.slice(i, j + 1);
      i = j;
    } else if (c === "/" && texto[i + 1] === "/") {
      while (i < texto.length && texto[i] !== "\n") i++;
      salida += "\n";
    } else if (c === "/" && texto[i + 1] === "*") {
      i = texto.indexOf("*/", i + 2);
      if (i === -1) break;
      i++;
    } else {
      salida += c;
    }
  }
  return salida.replace(/,(\s*[}\]])/g, "$1");
}

function fallar(mensaje) {
  console.error(`\npreparar-d1: ${mensaje}`);
  process.exit(1);
}

function wranglerBin() {
  if (process.env.TIENDITA_WRANGLER_BIN) return process.env.TIENDITA_WRANGLER_BIN;
  const require = createRequire(join(raiz, "package.json"));
  return join(dirname(require.resolve("wrangler/package.json")), "bin", "wrangler.js");
}

/** Corre wrangler sin shell (igual en Windows, macOS y Linux). */
function wrangler(args, capturar) {
  const r = spawnSync(process.execPath, [wranglerBin(), ...args], {
    cwd: raiz,
    encoding: "utf8",
    stdio: capturar ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (r.error) fallar(`no se pudo ejecutar wrangler (${r.error.message})`);
  if (capturar) {
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
  }
  return r;
}

let config;
try {
  config = JSON.parse(sinComentarios(readFileSync(join(raiz, "wrangler.jsonc"), "utf8")));
} catch (e) {
  fallar(`no se pudo leer wrangler.jsonc en ${raiz} (${e.message})`);
}
const d1 = (config.d1_databases ?? []).find((b) => b.binding === BINDING);
if (!d1) fallar(`wrangler.jsonc no tiene una base D1 con binding "${BINDING}"`);
if (d1.database_id) {
  console.log(`preparar-d1: la base "${BINDING}" ya tiene database_id; no hay nada que crear.`);
  process.exit(0);
}
// Mismo nombre que usaría el aprovisionamiento de wrangler si faltara database_name.
const nombre = d1.database_name ?? `${config.name}-${BINDING.toLowerCase()}`;

const info = wrangler(["d1", "info", nombre], true);
if (info.status === 0) {
  console.log(`preparar-d1: la base D1 "${nombre}" ya existe.`);
  process.exit(0);
}
if (!/couldn't find/i.test(`${info.stdout}\n${info.stderr}`)) {
  fallar(
    `no se pudo comprobar si existe la base D1 "${nombre}" (wrangler d1 info terminó con código ${info.status}). Revisá el error de arriba; no se creó nada.`,
  );
}
console.log(`preparar-d1: la base D1 "${nombre}" no existe todavía; se crea.`);
// --update-config=false: los IDs no hacen falta (el deploy encuentra la base por nombre) y así no pregunta.
const crear = wrangler(["d1", "create", nombre, "--update-config=false"], false);
if (crear.status !== 0) fallar(`wrangler d1 create ${nombre} falló (código ${crear.status}).`);
console.log(`preparar-d1: base D1 "${nombre}" creada.`);
