// Tests for the claim code integration (node --test, no build).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import claimCode, {
  ALPHABET,
  box,
  claimCodePlugin,
  codeFromEnv,
  encodeBase32,
  format,
  generateCode,
  hashOf,
  normalize,
  TEST_CLAIM_CODE,
  VIRTUAL_MODULE,
} from "./claim-code.mjs";

const sha256 = (t) => createHash("sha256").update(t).digest("hex");

describe("generation", () => {
  test("24 characters of the Crockford alphabet (120 bits), different on every build", () => {
    const a = generateCode();
    const b = generateCode();
    assert.equal(a.length, 24);
    for (const ch of a) assert.ok(ALPHABET.includes(ch), `character outside the alphabet: ${ch}`);
    assert.notEqual(a, b);
  });

  test("encodes 5 bits at a time like core (all zeros, all ones, known prefix)", () => {
    assert.equal(encodeBase32(new Uint8Array(15)), "0".repeat(24));
    assert.equal(encodeBase32(new Uint8Array(15).fill(0xff)), "Z".repeat(24));
    const bytes = new Uint8Array(15);
    bytes.set([0x08, 0x86, 0x42, 0x98, 0xe8]);
    assert.equal(encodeBase32(bytes).slice(0, 8), "12345678");
  });

  test("formats in six groups of four", () => {
    assert.equal(format("ABCDEFGHJKMNPQRSTVWXYZ01"), "ABCD-EFGH-JKMN-PQRS-TVWX-YZ01");
  });
});

describe("CODIGO_DE_RECLAMO", () => {
  test("if set it is used (normalized) instead of generating one", () => {
    assert.equal(
      codeFromEnv({ CODIGO_DE_RECLAMO: "7kq2-m9xd-4rta-abcd-efgh-o1l2" }),
      "7KQ2M9XD4RTAABCDEFGH0112",
    );
  });

  test("empty or missing → generates one", () => {
    assert.equal(codeFromEnv({}).length, 24);
    assert.equal(codeFromEnv({ CODIGO_DE_RECLAMO: "" }).length, 24);
  });

  test("malformed → clear error (never build with a code nobody could type)", () => {
    assert.throws(() => codeFromEnv({ CODIGO_DE_RECLAMO: "corto" }), /CODIGO_DE_RECLAMO/);
  });

  test("the tests' public code is only accepted in the test build (never in a publishable one)", () => {
    const testCode = TEST_CLAIM_CODE.toLowerCase();
    assert.throws(() => codeFromEnv({ CODIGO_DE_RECLAMO: testCode }), /public test code/);
    assert.equal(
      codeFromEnv({ CODIGO_DE_RECLAMO: testCode, TIENDITA_TEST_BUILD: "1" }),
      normalize(TEST_CLAIM_CODE),
    );
  });
});

describe("hash and box", () => {
  test("the hash is the hex SHA-256 of the normalized code (as core compares it)", () => {
    assert.equal(hashOf("7kq2-m9xd-4rta-abcd-efgh-o1l2"), sha256("7KQ2M9XD4RTAABCDEFGH0112"));
  });

  test("the box shows the formatted code, an easy-to-find line and where to use it", () => {
    const text = box("7KQ2M9XD4RTAABCDEFGH0112");
    assert.match(text, /CODIGO DE RECLAMO: 7KQ2-M9XD-4RTA-ABCD-EFGH-0112/);
    assert.match(text, /Reclamar mi tienda/);
    const lines = text.split("\n").filter((l) => l.startsWith("|"));
    assert.ok(lines.length > 2);
    assert.equal(new Set(lines.map((l) => l.length)).size, 1, "all the box lines have the same length");
  });
});

describe("Vite plugin", () => {
  const plugin = claimCodePlugin({ code: "7KQ2M9XD4RTAABCDEFGH0112" });
  const context = (name) => ({
    environment: { name: name },
    error(message) {
      throw new Error(message);
    },
  });

  test("resolves the virtual module and on the server exports only the hash", () => {
    const id = plugin.resolveId(VIRTUAL_MODULE);
    assert.ok(id.startsWith("\0"));
    const code = plugin.load.call(context("ssr"), id);
    assert.equal(
      code,
      `export const claimCodeHash = ${JSON.stringify(sha256("7KQ2M9XD4RTAABCDEFGH0112"))};\n`,
    );
    assert.ok(!code.includes("7KQ2"));
    assert.equal(plugin.resolveId("other"), undefined);
    assert.equal(plugin.load.call(context("ssr"), "other"), undefined);
  });

  test("if a client script imports it, the build fails", () => {
    const id = plugin.resolveId(VIRTUAL_MODULE);
    assert.throws(() => plugin.load.call(context("client"), id), /client script/);
  });
});

describe("Astro integration", () => {
  test("adds the plugin on astro:config:setup and prints the box when the build is done", () => {
    const integration = claimCode({ environment: { CODIGO_DE_RECLAMO: "7KQ2M9XD4RTAABCDEFGH0112" } });
    let config;
    integration.hooks["astro:config:setup"]({ command: "build", updateConfig: (c) => (config = c) });
    assert.equal(config.vite.plugins[0].name, "tiendita:claim-code");
    const output = [];
    const original = console.log;
    console.log = (t) => output.push(t);
    try {
      integration.hooks["astro:build:done"]();
    } finally {
      console.log = original;
    }
    assert.match(output.join("\n"), /CODIGO DE RECLAMO: 7KQ2-M9XD-4RTA-ABCD-EFGH-0112/);
  });
});
