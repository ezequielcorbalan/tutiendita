// Browser helpers for the panel pages (Astro bundles them). Never imports anything from the server:
// the claim code and the session live on the other side; here the API is only called with fetch.
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { languageFromLang, texts } from "../i18n";

export { browserSupportsWebAuthn };

/** Texts in the store language, which the server left in `<html lang>`. */
export const t = () => texts(languageFromLang(document.documentElement.lang));

export class PanelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type ErrorBody = { error?: { code?: string; message?: string } };

/** Same-origin fetch; API errors become a `PanelError` with a message to show. */
export async function request<T = unknown>(
  method: string,
  url: string,
  body?: unknown | FormData,
): Promise<T> {
  const init: RequestInit = { method: method, credentials: "same-origin" };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & ErrorBody;
  if (!res.ok) {
    const code = data.error?.code ?? "INTERNAL";
    const messages: Record<string, string> = t().errors.api;
    throw new PanelError(code, messages[code] ?? data.error?.message ?? t().errors.api.INTERNAL);
  }
  return data;
}

/** Text to show for any error (API, WebAuthn or network). */
export function messageOf(error: unknown): string {
  if (error instanceof PanelError) return error.message;
  if (error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return t().errors.cancelled;
  }
  if (error instanceof Error && error.name === "InvalidStateError") {
    return t().errors.api.PASSKEY_ALREADY_REGISTERED;
  }
  return t().errors.connection;
}

export function showError(where: Element | null, error: unknown): void {
  if (where) where.textContent = messageOf(error);
}

export const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector} on the page`);
  return el;
};

export type Progress = { step: string; completed: boolean };

export function goToStep(p: Progress): void {
  location.assign(p.completed ? "/panel" : `/panel/primer-ingreso/${p.step}`);
}

/** Completes (or skips) an onboarding step and goes to the next one. */
export async function advance(step: string, skipped = false): Promise<void> {
  goToStep(
    await request<Progress>("POST", "/api/onboarding/advance", skipped ? { step, skipped } : { step }),
  );
}

/** Server options → fingerprint/face/PIN → verification. Returns the recovery code if there's a new one. */
export async function registerPasskey(): Promise<{ recoveryCode: string | null }> {
  const options = await request<Parameters<typeof startRegistration>[0]["optionsJSON"]>(
    "POST",
    "/api/access/passkeys/options",
    {},
  );
  const response = await startRegistration({ optionsJSON: options });
  return request("POST", "/api/access/passkeys", { response });
}

/** Passkey sign-in; with `autocomplete`, waits for the person to pick it in the field (if the browser can). */
export async function signInWithPasskey(autocomplete = false): Promise<boolean> {
  if (autocomplete && !(await browserSupportsWebAuthnAutofill())) return false;
  const options = await request<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(
    "POST",
    "/api/access/sign-in/options",
    {},
  );
  const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill: autocomplete });
  await request("POST", "/api/access/sign-in", { response });
  return true;
}

/** appendChild of nodes and texts (the Workers types hide the DOM append in this project). */
export function add(parent: Node, ...children: (Node | string)[]): void {
  for (const h of children) parent.appendChild(typeof h === "string" ? document.createTextNode(h) : h);
}

/**
 * Shows the recovery code ONCE, with copy, download and print, and doesn't let the person go on until
 * they tick "Lo guardé en un lugar seguro".
 */
export function showRecoveryCode(
  container: HTMLElement,
  code: string,
  onConfirm: () => void,
  buttonText?: string,
): void {
  const codeTexts = t().recoveryCode;
  container.replaceChildren();
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const title = make("h2", codeTexts.title);
  const explanation = make("p", codeTexts.explanation);
  const value = make("p");
  const strong = make("strong", code);
  strong.style.fontFamily = "monospace";
  strong.style.fontSize = "1.4em";
  add(value, strong);

  const copy = make("button", codeTexts.copy);
  copy.type = "button";
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(code);
    copy.textContent = codeTexts.copied;
  });
  const download = make("a", codeTexts.download);
  download.href = URL.createObjectURL(
    new Blob([codeTexts.file(location.host, code)], { type: "text/plain" }),
  );
  download.download = codeTexts.fileName;
  const print = make("button", codeTexts.print);
  print.type = "button";
  print.addEventListener("click", () => window.print());
  const actions = make("p");
  add(actions, copy, " ", download, " ", print);

  const label = make("label");
  const marker = make("input");
  marker.type = "checkbox";
  add(label, marker, ` ${codeTexts.saved}`);
  const proceed = make("button", buttonText ?? t().common.continue);
  proceed.type = "button";
  proceed.disabled = true;
  marker.addEventListener("change", () => {
    proceed.disabled = !marker.checked;
  });
  proceed.addEventListener("click", onConfirm);
  const notice = make("p");
  add(notice, make("small", codeTexts.notice));

  add(container, title, explanation, value, actions, label, make("br"), proceed, notice);
  container.hidden = false;
}

/** Price as people type it ("2.500,50" or "2500.5") → minor units (cents) as text; "x" when invalid (the API rejects it). */
export function toMinorUnits(text: string): string {
  const clean = text.trim().replace(/\s/g, "");
  const normalized = /,\d{1,2}$/.test(clean)
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? String(Math.round(value * 100)) : "x";
}
