import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildBundle, checkTag } from "./hosted-bundle.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "hosted-bundle-"));
  const server = join(root, "server");
  const client = join(root, "client");
  const migrations = join(root, "migrations");
  for (const d of [server, join(server, "chunks"), client, join(client, "_astro"), migrations]) mkdirSync(d);
  writeFileSync(
    join(server, "wrangler.json"),
    JSON.stringify({
      main: "entry.mjs",
      compatibility_date: "2026-08-15",
      compatibility_flags: ["nodejs_compat"],
      assets: { binding: "ASSETS" },
    }),
  );
  writeFileSync(join(server, "entry.mjs"), "export default {}");
  writeFileSync(join(server, "entry.mjs.map"), "{}");
  writeFileSync(join(server, "chunks", "a.mjs"), "export const a = 1");
  writeFileSync(join(client, "_astro", "app.css"), "body{}");
  writeFileSync(join(client, "_headers"), "/_astro/*\n  Cache-Control: immutable");
  writeFileSync(join(client, ".assetsignore"), "wrangler.json\n.dev.vars");
  writeFileSync(join(client, "wrangler.json"), "{}");
  writeFileSync(join(migrations, "0001_b.sql"), "CREATE TABLE b (x);");
  writeFileSync(join(migrations, "0000_a.sql"), "CREATE TABLE a (x);");
  mkdirSync(join(migrations, "meta"));
  return { serverDir: server, clientDir: client, migrationsDir: migrations, version: "1.2.3" };
}

test("bundles modules without source maps, with posix names and module types", () => {
  const b = buildBundle(fixture());
  assert.equal(b.mainModule, "entry.mjs");
  assert.deepEqual(b.modules.map((m) => m.name).sort(), ["chunks/a.mjs", "entry.mjs"]);
  assert.ok(b.modules.every((m) => m.type === "application/javascript+module"));
  assert.equal(
    Buffer.from(b.modules.find((m) => m.name === "entry.mjs").content, "base64").toString(),
    "export default {}",
  );
  assert.deepEqual(b.compatibilityFlags, ["nodejs_compat"]);
});

test("assets skip .assetsignore entries and _headers, which goes in the config", () => {
  const b = buildBundle(fixture());
  assert.deepEqual(
    b.assets.map((a) => a.path),
    ["/_astro/app.css"],
  );
  assert.equal(b.assets[0].contentType, "text/css");
  assert.match(b.assetsConfig._headers, /immutable/);
});

test("migrations are the .sql files in order", () => {
  const b = buildBundle(fixture());
  assert.deepEqual(
    b.migrations.map((m) => m.name),
    ["0000_a.sql", "0001_b.sql"],
  );
});

test("the release tag must match package.json", () => {
  assert.doesNotThrow(() => checkTag("1.2.3", "v1.2.3"));
  assert.doesNotThrow(() => checkTag("1.2.3", undefined));
  assert.throws(() => checkTag("1.2.3", "v1.2.4"), /1\.2\.3 but the release is v1\.2\.4/);
});
