// `astro build` with the tests' claim code pinned (CODIGO_DE_RECLAMO), so the Vitest "pages" project
// can claim the store against the built Worker. Cross-platform (no `VAR=x cmd`).
// TIENDITA_TEST_BUILD=1 is the only thing that enables that public code in the integration; the demo
// deploy builds again before publishing (package.json), so this dist/ never reaches Cloudflare.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { TEST_CLAIM_CODE } from "../integrations/claim-code.mjs";

const require = createRequire(import.meta.url);
const astroBin = join(dirname(require.resolve("astro/package.json")), "bin", "astro.mjs");

const r = spawnSync(process.execPath, [astroBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, CODIGO_DE_RECLAMO: TEST_CLAIM_CODE, TIENDITA_TEST_BUILD: "1" },
});
process.exit(r.status ?? 1);
