#!/usr/bin/env node
// Creates the store's D1 database if it does not exist yet. Runs in `npm run deploy` before the migrations:
// wrangler's automatic provisioning only happens inside `wrangler deploy`, and
// `wrangler d1 migrations apply --remote` fails with "Couldn't find a D1 DB named ..." if the database is missing.
//
//   node scripts/prepare-d1.mjs     (from the folder that has wrangler.jsonc)
//
// No dependencies: reads wrangler.jsonc, runs `wrangler d1 info <db>` and, only if wrangler says it cannot
// find it, `wrangler d1 create <db>`. Any other error stops the deploy. TIENDITA_WRANGLER_BIN
// replaces the installed wrangler (the tests point it to a fake wrangler).
//
// The database is named after the Worker (<worker>-db). If wrangler.jsonc points to another name (the deploy
// button keeps the repo's default and connects to an existing database with that name), the store keeps it
// only when that database is its own (its owner's address is this Worker); otherwise it switches to
// <worker>-db and writes it to wrangler.jsonc, so two stores never share data.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const BINDING = "DB";
const root = process.cwd();

/** Strips comments (// and /* *\/) and trailing commas from JSONC, respecting strings. */
function withoutComments(text) {
  let output = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      output += text.slice(i, j + 1);
      i = j;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      output += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i === -1) break;
      i++;
    } else {
      output += c;
    }
  }
  return output.replace(/,(\s*[}\]])/g, "$1");
}

function fail(message) {
  console.error(`\nprepare-d1: ${message}`);
  process.exit(1);
}

function wranglerBin() {
  if (process.env.TIENDITA_WRANGLER_BIN) return process.env.TIENDITA_WRANGLER_BIN;
  const require = createRequire(join(root, "package.json"));
  return join(dirname(require.resolve("wrangler/package.json")), "bin", "wrangler.js");
}

/** Runs wrangler without a shell (same on Windows, macOS and Linux). */
function wrangler(args, capture) {
  const r = spawnSync(process.execPath, [wranglerBin(), ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (r.error) fail(`could not run wrangler (${r.error.message})`);
  if (capture) {
    process.stdout.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
  }
  return r;
}

/** True if `db`'s owner (its primary address) is this Worker; false if it has no owner yet or no tables. */
function ownedByThisWorker(db) {
  const sql = "SELECT origen FROM origenes_permitidos WHERE principal = 1";
  const r = wrangler(["d1", "execute", db, "--remote", "--json", "--command", sql], true);
  const output = `${r.stdout}\n${r.stderr}`;
  if (r.status !== 0) {
    if (/no such table/i.test(output)) return false;
    fail(`could not check who owns D1 database "${db}" (wrangler d1 execute exited with code ${r.status}).`);
  }
  const origin = JSON.parse(r.stdout)[0]?.results?.[0]?.origen;
  return origin !== undefined && new URL(origin).hostname.split(".")[0] === config.name;
}

const file = join(root, "wrangler.jsonc");
let config;
try {
  config = JSON.parse(withoutComments(readFileSync(file, "utf8")));
} catch (e) {
  fail(`could not read wrangler.jsonc in ${root} (${e.message})`);
}
const d1 = (config.d1_databases ?? []).find((b) => b.binding === BINDING);
if (!d1) fail(`wrangler.jsonc has no D1 database with binding "${BINDING}"`);
// Same name wrangler's provisioning would use if database_name were missing.
const name = `${config.name}-${BINDING.toLowerCase()}`;
if (d1.database_name && d1.database_name !== name) {
  if (ownedByThisWorker(d1.database_name)) {
    console.log(`prepare-d1: D1 database "${d1.database_name}" belongs to this store; keeping it.`);
    process.exit(0);
  }
  console.log(
    `prepare-d1: D1 database "${d1.database_name}" is not this store's; using "${name}" (written to wrangler.jsonc).`,
  );
  // shortcut: one D1 entry per wrangler.jsonc (the store's only database), regexes instead of a JSONC editor.
  writeFileSync(
    file,
    readFileSync(file, "utf8")
      .replace(/"database_name":\s*"[^"]*"/, `"database_name": "${name}"`)
      .replace(/,\s*"database_id":\s*"[^"]*"/, ""),
  );
} else if (d1.database_id) {
  console.log(`prepare-d1: database "${BINDING}" already has a database_id; nothing to create.`);
  process.exit(0);
}

const info = wrangler(["d1", "info", name], true);
if (info.status === 0) {
  console.log(`prepare-d1: D1 database "${name}" already exists.`);
  process.exit(0);
}
if (!/couldn't find/i.test(`${info.stdout}\n${info.stderr}`)) {
  fail(
    `could not check whether D1 database "${name}" exists (wrangler d1 info exited with code ${info.status}). See the error above; nothing was created.`,
  );
}
console.log(`prepare-d1: D1 database "${name}" does not exist yet; creating it.`);
// --update-config=false: IDs are not needed (deploy finds the database by name) and it does not prompt.
const create = wrangler(["d1", "create", name, "--update-config=false"], false);
if (create.status !== 0) fail(`wrangler d1 create ${name} failed (code ${create.status}).`);
console.log(`prepare-d1: D1 database "${name}" created.`);
