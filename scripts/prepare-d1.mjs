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
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

let config;
try {
  config = JSON.parse(withoutComments(readFileSync(join(root, "wrangler.jsonc"), "utf8")));
} catch (e) {
  fail(`could not read wrangler.jsonc in ${root} (${e.message})`);
}
const d1 = (config.d1_databases ?? []).find((b) => b.binding === BINDING);
if (!d1) fail(`wrangler.jsonc has no D1 database with binding "${BINDING}"`);
if (d1.database_id) {
  console.log(`prepare-d1: database "${BINDING}" already has a database_id; nothing to create.`);
  process.exit(0);
}
// Same name wrangler's provisioning would use if database_name were missing.
const name = d1.database_name ?? `${config.name}-${BINDING.toLowerCase()}`;

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
