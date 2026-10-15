// Astro integration: the store's claim code.
//
// On every `astro build` it generates a random 120-bit code (24 Crockford base32 characters), prints it
// in a box at the end of the build output (in Workers Builds, the build log that only the Cloudflare
// account owner sees) and embeds ONLY its SHA-256 in the virtual module `virtual:tiendita/claim`, which
// the Worker code imports. If a client script imported it, the build fails. With the build variable
// CODIGO_DE_RECLAMO that code is used instead of generating one (tests, CI or whoever prefers to pin it);
// it is not declared in .dev.vars.example: the button doesn't ask for it. The variable name and the printed
// "CODIGO DE RECLAMO" box stay in Spanish: stores may already have it configured and the box is for people.
// The tests' public code is only accepted with TIENDITA_TEST_BUILD=1 (scripts/test-build.mjs): a
// publishable build with that code would leave the store claimable by anyone.
import { createHash } from "node:crypto";

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const VIRTUAL_MODULE = "virtual:tiendita/claim";
const RESOLVED_ID = `\0${VIRTUAL_MODULE}`;
const WELL_FORMED = /^[0-9A-HJKMNP-TV-Z]{24}$/;
/** Fixed test code (public: it's in the repo). Lives here so the integration can reject it. */
export const TEST_CLAIM_CODE = "TEST-T1EN-D1TA-0000-0000-0001";

/** 15 bytes → 24 Crockford characters (same encoding as core's `codeFromBytes`). */
export function encodeBase32(bytes) {
  let output = "";
  let accumulated = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulated = (accumulated << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += ALPHABET[(accumulated >> bits) & 31];
    }
    accumulated &= (1 << bits) - 1;
  }
  return output;
}

/** Same as core's `normalizeCode`: no separators, uppercase, O→0 and I/L→1. */
export const normalize = (text) =>
  text
    .replace(/[\s-]+/g, "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

export const format = (code) => code.match(/.{1,4}/g).join("-");

export const generateCode = () => encodeBase32(crypto.getRandomValues(new Uint8Array(15)));

export function codeFromEnv(environment = process.env) {
  const pinned = environment.CODIGO_DE_RECLAMO;
  if (pinned === undefined || pinned === "") return generateCode();
  const code = normalize(pinned);
  if (!WELL_FORMED.test(code)) {
    throw new Error(
      "CODIGO_DE_RECLAMO must have 24 Crockford base32 characters (for example 7KQ2-M9XD-4RTA-ABCD-EFGH-0112).",
    );
  }
  if (code === normalize(TEST_CLAIM_CODE) && environment.TIENDITA_TEST_BUILD !== "1") {
    throw new Error("CODIGO_DE_RECLAMO is the tests' public test code: it only works for the test build.");
  }
  return code;
}

export const hashOf = (code) => createHash("sha256").update(normalize(code)).digest("hex");

/** Very visible box (text for people, in Spanish), with an ASCII line easy to find in the log ("CODIGO DE RECLAMO:"). */
export function box(code) {
  const lines = [
    "",
    "TU TIENDITA: CÓDIGO PARA RECLAMARLA",
    "",
    `CODIGO DE RECLAMO: ${format(code)}`,
    "",
    'Abrí tu tienda, tocá "Reclamar mi tienda" y pegá este código.',
    "Vale el del último deploy y deja de servir cuando la reclamás.",
    "",
  ];
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const edge = `+${"=".repeat(width)}+`;
  return ["", edge, ...lines.map((l) => `|  ${l.padEnd(width - 2)}|`), edge, ""].join("\n");
}

export function claimCodePlugin({ code }) {
  return {
    name: "tiendita:claim-code",
    resolveId(id) {
      return id === VIRTUAL_MODULE ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      if (this.environment?.name === "client") {
        this.error(`${VIRTUAL_MODULE} can only be imported from the server, never from a client script.`);
      }
      return `export const claimCodeHash = ${JSON.stringify(hashOf(code))};\n`;
    },
  };
}

export default function claimCode({ environment = process.env } = {}) {
  let code = null;
  const print = () => console.log(box(code));
  return {
    name: "tiendita:claim-code",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        code = codeFromEnv(environment);
        updateConfig({ vite: { plugins: [claimCodePlugin({ code })] } });
      },
      // In `astro dev` the code shows in the terminal; in the build, at the end of the output so it stays visible.
      "astro:server:start": print,
      "astro:build:done": print,
    },
  };
}
