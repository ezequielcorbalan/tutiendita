import type { ClienteGithub, ConexionGithub, ConexionLista } from "../../core/index";
import { archivosDelTarball } from "./tarball";

const API = "https://api.github.com";

type Fetch = typeof fetch;

/** Error de GitHub con el status: los casos de uso lo convierten en un aviso para el panel. */
export class ErrorGithub extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(`GitHub ${status}: ${mensaje}`);
  }
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const b64urlTexto = (s: string) => b64url(new TextEncoder().encode(s));

function largoDer(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let x = n; x > 0; x >>= 8) bytes.unshift(x & 0xff);
  return [0x80 | bytes.length, ...bytes];
}

/** GitHub entrega la clave en PKCS#1 (`BEGIN RSA PRIVATE KEY`); WebCrypto solo importa PKCS#8. */
export function pkcs8DesdePem(pem: string): Uint8Array<ArrayBuffer> {
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  if (!pem.includes("BEGIN RSA PRIVATE KEY")) return der;
  const version = [0x02, 0x01, 0x00];
  const rsa = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octetos = [0x04, ...largoDer(der.length), ...der];
  const cuerpo = [...version, ...rsa, ...octetos];
  return Uint8Array.from([0x30, ...largoDer(cuerpo.length), ...cuerpo]);
}

/** JWT RS256 de la app (vale 10 minutos; se adelanta 60 s por relojes desfasados, como pide GitHub). */
export async function jwtDeLaApp(appId: number, pem: string, ahora: Date): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8DesdePem(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const iat = Math.floor(ahora.getTime() / 1000) - 60;
  const datos = `${b64urlTexto(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64urlTexto(
    JSON.stringify({ iat, exp: iat + 600, iss: String(appId) }),
  )}`;
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(datos));
  return `${datos}.${b64url(new Uint8Array(firma))}`;
}

/** SHA-1 de git para un blob: el mismo contenido tiene el mismo SHA en cualquier repo. */
export async function shaDeBlob(contenido: Uint8Array): Promise<string> {
  const cabecera = new TextEncoder().encode(`blob ${contenido.length}\0`);
  const todo = new Uint8Array(cabecera.length + contenido.length);
  todo.set(cabecera);
  todo.set(contenido, cabecera.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", todo));
  return [...hash].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const textoUtf8 = (bytes: Uint8Array): string | null => {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

export function crearClienteGithub(opciones: { fetch?: Fetch; reloj?: () => Date } = {}): ClienteGithub {
  const f: Fetch = opciones.fetch ?? fetch;
  const ahora = opciones.reloj ?? (() => new Date());

  async function pedir<T>(metodo: string, ruta: string, auth: string | null, cuerpo?: unknown): Promise<T> {
    const r = await f(ruta.startsWith("http") ? ruta : `${API}${ruta}`, {
      method: metodo,
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "tiendita",
        ...(auth ? { authorization: auth } : {}),
        ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    if (!r.ok) throw new ErrorGithub(r.status, `${metodo} ${ruta}: ${(await r.text()).slice(0, 300)}`);
    return (r.status === 204 ? undefined : await r.json()) as T;
  }

  async function tokenDeInstalacion(c: ConexionGithub & { instalacionId: number }): Promise<string> {
    const jwt = await jwtDeLaApp(c.appId, c.clavePrivada, ahora());
    const { token } = await pedir<{ token: string }>(
      "POST",
      `/app/installations/${c.instalacionId}/access_tokens`,
      `Bearer ${jwt}`,
    );
    return `token ${token}`;
  }

  return {
    async canjearManifiesto(codigo) {
      const app = await pedir<{ id: number; slug: string; pem: string }>(
        "POST",
        `/app-manifests/${encodeURIComponent(codigo)}/conversions`,
        null,
      );
      return { appId: app.id, slug: app.slug, clavePrivada: app.pem };
    },

    async repositoriosDeLaInstalacion(c) {
      const token = await tokenDeInstalacion(c);
      const r = await pedir<{ repositories: { full_name: string }[] }>(
        "GET",
        "/installation/repositories?per_page=100",
        token,
      );
      return r.repositories.map((x) => x.full_name);
    },

    async versionOficial(c, repoOficial) {
      const token = await tokenDeInstalacion(c);
      const r = await pedir<{ content: string }>(
        "GET",
        `/repos/${repoOficial}/contents/package.json?ref=main`,
        token,
      );
      const json = new TextDecoder().decode(
        Uint8Array.from(atob(r.content.replace(/\s/g, "")), (x) => x.charCodeAt(0)),
      );
      return String((JSON.parse(json) as { version?: string }).version ?? "0.0.0");
    },

    async prepararActualizacion(c: ConexionLista, p) {
      const token = await tokenDeInstalacion(c);
      const repo = c.repositorio;
      const { default_branch: rama } = await pedir<{ default_branch: string }>(
        "GET",
        `/repos/${repo}`,
        token,
      );
      const cabeza = await pedir<{ sha: string; commit: { tree: { sha: string } } }>(
        "GET",
        `/repos/${repo}/commits/${encodeURIComponent(rama)}`,
        token,
      );
      const actual = await pedir<{ tree: { path: string; sha: string; type: string }[] }>(
        "GET",
        `/repos/${repo}/git/trees/${cabeza.commit.tree.sha}?recursive=1`,
        token,
      );
      const shaActual = new Map(actual.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));

      // Un solo pedido para todo el repo oficial (el plan gratuito permite 50 subpedidos por request).
      const tar = await f(`${API}/repos/${p.repoOficial}/tarball/main`, {
        headers: { authorization: token, "user-agent": "tiendita", accept: "application/vnd.github+json" },
      });
      if (!tar.ok || !tar.body) throw new ErrorGithub(tar.status, "tarball del repo oficial");
      const oficiales = await archivosDelTarball(tar.body.pipeThrough(new DecompressionStream("gzip")));

      const entradas: { path: string; mode: string; type: "blob"; sha?: string; content?: string }[] = [];
      let wranglerCambio = false;
      for (const a of oficiales) {
        const sha = await shaDeBlob(a.contenido);
        if (shaActual.get(a.ruta) === sha) continue;
        if (p.conservar.includes(a.ruta)) {
          wranglerCambio = true;
          continue;
        }
        const texto = textoUtf8(a.contenido);
        if (texto !== null) {
          entradas.push({ path: a.ruta, mode: a.modo, type: "blob", content: texto });
        } else {
          let binario = "";
          for (const b of a.contenido) binario += String.fromCharCode(b);
          const blob = await pedir<{ sha: string }>("POST", `/repos/${repo}/git/blobs`, token, {
            content: btoa(binario),
            encoding: "base64",
          });
          entradas.push({ path: a.ruta, mode: a.modo, type: "blob", sha: blob.sha });
        }
      }
      // shortcut: no borra lo que el repo oficial eliminó (podrían ser archivos propios); mejorar si molesta.
      if (entradas.length === 0) return null;

      const arbol = await pedir<{ sha: string }>("POST", `/repos/${repo}/git/trees`, token, {
        base_tree: cabeza.commit.tree.sha,
        tree: entradas,
      });
      const commit = await pedir<{ sha: string }>("POST", `/repos/${repo}/git/commits`, token, {
        message: `Actualizar tutiendita a la versión ${p.version}`,
        tree: arbol.sha,
        parents: [cabeza.sha],
      });
      const ramaNueva = `tutiendita-${p.version}`;
      try {
        await pedir("POST", `/repos/${repo}/git/refs`, token, {
          ref: `refs/heads/${ramaNueva}`,
          sha: commit.sha,
        });
      } catch (e) {
        if (!(e instanceof ErrorGithub) || e.status !== 422) throw e;
        await pedir("PATCH", `/repos/${repo}/git/refs/heads/${ramaNueva}`, token, {
          sha: commit.sha,
          force: true,
        });
      }
      const dueno = repo.split("/")[0];
      const abiertos = await pedir<{ number: number; html_url: string }[]>(
        "GET",
        `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${dueno}:${ramaNueva}`)}`,
        token,
      );
      const pr =
        abiertos[0] ??
        (await pedir<{ number: number; html_url: string }>("POST", `/repos/${repo}/pulls`, token, {
          title: `Actualizar tutiendita a la versión ${p.version}`,
          head: ramaNueva,
          base: rama,
          body: [
            `Trae la versión ${p.version} de [${p.repoOficial}](https://github.com/${p.repoOficial}). Cambian ${entradas.length} archivos.`,
            "",
            `Se conservan sin tocar: ${p.conservar.map((x) => `\`${x}\``).join(", ")}.`,
            wranglerCambio
              ? "**Atención:** el repo oficial cambió `wrangler.jsonc`; revisá esos cambios a mano antes de aplicar."
              : "",
            "Si cambiaste el código de tu tienda, revisá el diff: esta actualización pisa los archivos que cambiaron en la versión oficial.",
            "",
            "Al aplicarlo (merge), Cloudflare vuelve a publicar la tienda y aplica las migraciones de la base.",
          ]
            .filter((l, i, a) => l !== "" || a[i - 1] !== "")
            .join("\n"),
        }));
      return { numero: pr.number, url: pr.html_url, archivos: entradas.length };
    },

    async aplicarActualizacion(c, numero) {
      const token = await tokenDeInstalacion(c);
      await pedir("PUT", `/repos/${c.repositorio}/pulls/${numero}/merge`, token, { merge_method: "squash" });
    },
  };
}
