import { ONBOARDING_STEPS, type SessionType, type StoreStatus } from "../packages/core/index";

/**
 * Where the merchant can go inside /panel by store status and session. Pure function: the Astro
 * middleware uses it and it's tested without a build. Paths are public URLs and session types are
 * stored in D1: both stay in Spanish.
 */
export type PanelDecision = { type: "show" } | { type: "redirect"; to: string };

const SHOW: PanelDecision = { type: "show" };
const go = (to: string): PanelDecision => ({ type: "redirect", to });
const ONBOARDING = "/panel/primer-ingreso/";

const onlyThese = (path: string, allowed: readonly string[], target: string): PanelDecision =>
  allowed.includes(path) ? SHOW : go(target);

export function decidePanelRoute(e: {
  status: StoreStatus;
  session: SessionType | null;
  path: string;
}): PanelDecision {
  const path = e.path.length > 1 ? e.path.replace(/\/+$/, "") : e.path;
  const { status } = e;

  if (status.status === "unclaimed") {
    // With the code already validated, what's left is creating the passkey.
    return e.session === "reclamo"
      ? onlyThese(path, ["/panel/reclamar", `${ONBOARDING}acceso`], `${ONBOARDING}acceso`)
      : onlyThese(path, ["/panel/reclamar"], "/panel/reclamar");
  }
  if (e.session === "recuperacion") return onlyThese(path, ["/panel/recuperar"], "/panel/recuperar");
  if (e.session !== "completa")
    return onlyThese(path, ["/panel/ingresar", "/panel/recuperar"], "/panel/ingresar");

  if (status.status === "setting-up") {
    const current = `${ONBOARDING}${status.step}`;
    if (!path.startsWith(ONBOARDING)) return go(current);
    const order = ONBOARDING_STEPS.indexOf(path.slice(ONBOARDING.length) as never);
    return order !== -1 && order <= ONBOARDING_STEPS.indexOf(status.step) ? SHOW : go(current);
  }

  const signedOutOnly = ["/panel/reclamar", "/panel/ingresar", "/panel/recuperar"];
  return signedOutOnly.includes(path) || path.startsWith(ONBOARDING) ? go("/panel") : SHOW;
}
