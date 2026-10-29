// Builds the bundle the tutiendita hosting service deploys on hosted stores (the hosted plan): the store's
// Worker modules (dist/server), its static assets (dist/client) and its D1 migrations, base64, in one JSON.
//   npm run build && node scripts/hosted-bundle.mjs tiendita-bundle.json [vX.Y.Z]
// The release workflow (.github/workflows/hosted-bundle.yml) attaches it to every GitHub release.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_TYPES = {
  ".mjs": "application/javascript+module",
  ".js": "application/javascript+module",
  ".wasm": "application/wasm",
  ".txt": "text/plain",
  ".bin": "application/octet-stream",
};
const CONTENT_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};
/** Files wrangler never uploads as assets; _headers and _redirects travel in the assets config instead. */
const NOT_ASSETS = new Set([".assetsignore", "_headers", "_redirects", "_worker.js", "_routes.json"]);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const posix = (path) => path.split(sep).join("/");

export function buildBundle({ serverDir, clientDir, migrationsDir, version }) {
  const config = JSON.parse(readFileSync(join(serverDir, "wrangler.json"), "utf8"));
  const modules = walk(serverDir)
    .filter((f) => !f.endsWith(".map") && !f.endsWith("wrangler.json"))
    .map((f) => {
      const type = MODULE_TYPES[extname(f)];
      if (!type) throw new Error(`Unknown Worker module type: ${f}`);
      return { name: posix(relative(serverDir, f)), type, content: readFileSync(f).toString("base64") };
    });
  if (!modules.some((m) => m.name === config.main))
    throw new Error(`Main module ${config.main} not in ${serverDir}`);

  const ignorePath = join(clientDir, ".assetsignore");
  const ignored = new Set(
    statSync(ignorePath, { throwIfNoEntry: false })
      ? readFileSync(ignorePath, "utf8")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#"))
      : [],
  );
  const assets = walk(clientDir)
    .map((f) => ({ file: f, path: `/${posix(relative(clientDir, f))}` }))
    .filter(({ path }) => !NOT_ASSETS.has(path.slice(1)) && !ignored.has(path.slice(1)))
    .map(({ file, path }) => ({
      path,
      contentType: CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/null",
      content: readFileSync(file).toString("base64"),
    }));
  const headersPath = join(clientDir, "_headers");
  const assetsConfig = {
    ...(config.assets?.html_handling ? { html_handling: config.assets.html_handling } : {}),
    ...(config.assets?.not_found_handling ? { not_found_handling: config.assets.not_found_handling } : {}),
    ...(config.assets?.run_worker_first !== undefined
      ? { run_worker_first: config.assets.run_worker_first }
      : {}),
    ...(statSync(headersPath, { throwIfNoEntry: false })
      ? { _headers: readFileSync(headersPath, "utf8") }
      : {}),
  };

  const migrations = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") }));

  return {
    version,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: config.compatibility_flags ?? [],
    mainModule: config.main,
    modules,
    assets,
    assetsConfig,
    migrations,
  };
}

/** The version the bundle carries must be the release's: the hosting service files it under that number. */
export function checkTag(version, tag) {
  if (tag && tag !== `v${version}`) throw new Error(`package.json is ${version} but the release is ${tag}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [out = "tiendita-bundle.json", tag] = process.argv.slice(2);
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  checkTag(version, tag);
  const bundle = buildBundle({
    serverDir: join(root, "dist", "server"),
    clientDir: join(root, "dist", "client"),
    migrationsDir: join(root, "migraciones"),
    version,
  });
  writeFileSync(out, JSON.stringify(bundle));
  console.log(
    `Bundle ${version}: ${bundle.modules.length} modules, ${bundle.assets.length} assets, ${bundle.migrations.length} migrations`,
  );
}
