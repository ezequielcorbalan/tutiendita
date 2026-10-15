// Ayudas del navegador para las páginas del panel (las empaqueta Astro). Nunca importa nada del servidor:
// el código de reclamo y la sesión viven del otro lado; acá solo se llama a la API con fetch.
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { idiomaDeLang, textos } from "../i18n";

export { browserSupportsWebAuthn };

/** Textos en el idioma de la tienda, que el servidor dejó en `<html lang>`. */
export const t = () => textos(idiomaDeLang(document.documentElement.lang));

export class ErrorDelPanel extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

type CuerpoError = { error?: { codigo?: string; mensaje?: string } };

/** fetch al mismo origen; los errores de la API se convierten en `ErrorDelPanel` con un mensaje para mostrar. */
export async function pedir<T = unknown>(
  metodo: string,
  url: string,
  cuerpo?: unknown | FormData,
): Promise<T> {
  const init: RequestInit = { method: metodo, credentials: "same-origin" };
  if (cuerpo instanceof FormData) init.body = cuerpo;
  else if (cuerpo !== undefined) {
    init.body = JSON.stringify(cuerpo);
    init.headers = { "content-type": "application/json" };
  }
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const datos = (await res.json().catch(() => ({}))) as T & CuerpoError;
  if (!res.ok) {
    const codigo = datos.error?.codigo ?? "INTERNO";
    const mensajes: Record<string, string> = t().errores.api;
    throw new ErrorDelPanel(codigo, mensajes[codigo] ?? datos.error?.mensaje ?? t().errores.api.INTERNO);
  }
  return datos;
}

/** Texto para mostrar ante cualquier error (de la API, de WebAuthn o de red). */
export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorDelPanel) return error.message;
  if (error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return t().errores.cancelado;
  }
  if (error instanceof Error && error.name === "InvalidStateError") {
    return t().errores.api.PASSKEY_YA_REGISTRADA;
  }
  return t().errores.conexion;
}

export function mostrarError(donde: Element | null, error: unknown): void {
  if (donde) donde.textContent = mensajeDe(error);
}

export const elemento = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Falta ${selector} en la página`);
  return el;
};

export type Progreso = { paso: string; completado: boolean };

export function irAlPaso(p: Progreso): void {
  location.assign(p.completado ? "/panel" : `/panel/primer-ingreso/${p.paso}`);
}

/** Completa (o saltea) un paso del primer ingreso y va al siguiente. */
export async function avanzar(paso: string, salteado = false): Promise<void> {
  irAlPaso(
    await pedir<Progreso>("POST", "/api/primer-ingreso/avanzar", salteado ? { paso, salteado } : { paso }),
  );
}

/** Opciones del servidor → huella/cara/PIN → verificación. Devuelve el código de recuperación si hay uno nuevo. */
export async function registrarPasskey(): Promise<{ codigoDeRecuperacion: string | null }> {
  const opciones = await pedir<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
    "POST",
    "/api/acceso/passkeys/opciones",
    {},
  );
  const respuesta = await startRegistration({ optionsJSON: opciones });
  return pedir("POST", "/api/acceso/passkeys", { respuesta });
}

/** Ingreso con passkey; con `autocompletar`, espera a que la persona la elija en el campo (si el navegador puede). */
export async function ingresarConPasskey(autocompletar = false): Promise<boolean> {
  if (autocompletar && !(await browserSupportsWebAuthnAutofill())) return false;
  const opciones = await pedir<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
    "POST",
    "/api/acceso/ingreso/opciones",
    {},
  );
  const respuesta = await startAuthentication({ optionsJSON: opciones, useBrowserAutofill: autocompletar });
  await pedir("POST", "/api/acceso/ingreso", { respuesta });
  return true;
}

/**
 * Muestra el código de recuperación UNA vez, con copiar, descargar e imprimir, y no deja seguir hasta
 * marcar "Lo guardé en un lugar seguro".
 */
/** appendChild de nodos y textos (los tipos de Workers tapan el append del DOM en este proyecto). */
function agregar(padre: Node, ...hijos: (Node | string)[]): void {
  for (const h of hijos) padre.appendChild(typeof h === "string" ? document.createTextNode(h) : h);
}

export function mostrarCodigoDeRecuperacion(
  contenedor: HTMLElement,
  codigo: string,
  alConfirmar: () => void,
  textoDelBoton?: string,
): void {
  const textosDelCodigo = t().codigoDeRecuperacion;
  contenedor.replaceChildren();
  const nuevo = <K extends keyof HTMLElementTagNameMap>(tag: K, texto?: string) => {
    const el = document.createElement(tag);
    if (texto !== undefined) el.textContent = texto;
    return el;
  };
  const titulo = nuevo("h2", textosDelCodigo.titulo);
  const explicacion = nuevo("p", textosDelCodigo.explicacion);
  const valor = nuevo("p");
  const fuerte = nuevo("strong", codigo);
  fuerte.style.fontFamily = "monospace";
  fuerte.style.fontSize = "1.4em";
  agregar(valor, fuerte);

  const copiar = nuevo("button", textosDelCodigo.copiar);
  copiar.type = "button";
  copiar.addEventListener("click", async () => {
    await navigator.clipboard.writeText(codigo);
    copiar.textContent = textosDelCodigo.copiado;
  });
  const descargar = nuevo("a", textosDelCodigo.descargar);
  descargar.href = URL.createObjectURL(
    new Blob([textosDelCodigo.archivo(location.host, codigo)], { type: "text/plain" }),
  );
  descargar.download = textosDelCodigo.nombreDeArchivo;
  const imprimir = nuevo("button", textosDelCodigo.imprimir);
  imprimir.type = "button";
  imprimir.addEventListener("click", () => window.print());
  const acciones = nuevo("p");
  agregar(acciones, copiar, " ", descargar, " ", imprimir);

  const etiqueta = nuevo("label");
  const marca = nuevo("input");
  marca.type = "checkbox";
  agregar(etiqueta, marca, ` ${textosDelCodigo.guardado}`);
  const seguir = nuevo("button", textoDelBoton ?? t().comun.continuar);
  seguir.type = "button";
  seguir.disabled = true;
  marca.addEventListener("change", () => {
    seguir.disabled = !marca.checked;
  });
  seguir.addEventListener("click", alConfirmar);
  const aviso = nuevo("p");
  agregar(aviso, nuevo("small", textosDelCodigo.aviso));

  agregar(contenedor, titulo, explicacion, valor, acciones, etiqueta, nuevo("br"), seguir, aviso);
  contenedor.hidden = false;
}
