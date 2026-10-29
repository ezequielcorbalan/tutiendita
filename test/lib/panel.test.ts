import type { SessionType, StoreStatus } from "../../src/packages/core/index";
import { describe, expect, it } from "vitest";
import { decidePanelRoute } from "../../src/lib/panel";

const UNCLAIMED: StoreStatus = { status: "unclaimed" };
// Steps, session types and /panel paths are stored literals and public URLs: they stay in Spanish.
const settingUp = (step: "acceso" | "nombre" | "whatsapp" | "transferencia" | "producto"): StoreStatus => ({
  status: "setting-up",
  step,
});
const READY: StoreStatus = { status: "ready" };

const decide = (status: StoreStatus, session: SessionType | null, path: string) =>
  decidePanelRoute({ status, session, path });
const show = { type: "show" };
const to = (target: string) => ({ type: "redirect", to: target });

describe("unclaimed: everything leads to /panel/reclamar", () => {
  it.each(["/panel", "/panel/", "/panel/ingresar", "/panel/primer-ingreso/acceso", "/panel/acceso"])(
    "%s → reclamar",
    (path) => {
      expect(decide(UNCLAIMED, null, path)).toEqual(to("/panel/reclamar"));
    },
  );

  it("/panel/reclamar is shown", () => {
    expect(decide(UNCLAIMED, null, "/panel/reclamar")).toEqual(show);
    expect(decide(UNCLAIMED, null, "/panel/reclamar/")).toEqual(show);
  });

  it("with the code already validated (claim session) it moves on to creating the passkey", () => {
    expect(decide(UNCLAIMED, "reclamo", "/panel")).toEqual(to("/panel/primer-ingreso/acceso"));
    expect(decide(UNCLAIMED, "reclamo", "/panel/primer-ingreso/acceso")).toEqual(show);
    expect(decide(UNCLAIMED, "reclamo", "/panel/reclamar")).toEqual(show);
    expect(decide(UNCLAIMED, "reclamo", "/panel/primer-ingreso/nombre")).toEqual(
      to("/panel/primer-ingreso/acceso"),
    );
  });
});

describe("setting-up", () => {
  it.each([null, "reclamo"] as const)(
    "without a full session (%s) → ingresar; ingresar and recuperar are shown",
    (session) => {
      expect(decide(settingUp("nombre"), session, "/panel")).toEqual(to("/panel/ingresar"));
      expect(decide(settingUp("nombre"), session, "/panel/primer-ingreso/nombre")).toEqual(
        to("/panel/ingresar"),
      );
      expect(decide(settingUp("nombre"), session, "/panel/ingresar")).toEqual(show);
      expect(decide(settingUp("nombre"), session, "/panel/recuperar")).toEqual(show);
    },
  );

  it("with a full session it leads to the saved step; going back is allowed but not skipping ahead", () => {
    const status = settingUp("whatsapp");
    expect(decide(status, "completa", "/panel")).toEqual(to("/panel/primer-ingreso/whatsapp"));
    expect(decide(status, "completa", "/panel/ingresar")).toEqual(to("/panel/primer-ingreso/whatsapp"));
    expect(decide(status, "completa", "/panel/acceso")).toEqual(to("/panel/primer-ingreso/whatsapp"));
    expect(decide(status, "completa", "/panel/primer-ingreso/acceso")).toEqual(show);
    expect(decide(status, "completa", "/panel/primer-ingreso/nombre")).toEqual(show);
    expect(decide(status, "completa", "/panel/primer-ingreso/whatsapp")).toEqual(show);
    expect(decide(status, "completa", "/panel/primer-ingreso/producto")).toEqual(
      to("/panel/primer-ingreso/whatsapp"),
    );
    expect(decide(status, "completa", "/panel/primer-ingreso/otra")).toEqual(
      to("/panel/primer-ingreso/whatsapp"),
    );
  });
});

describe("ready", () => {
  it("no session → ingresar", () => {
    expect(decide(READY, null, "/panel")).toEqual(to("/panel/ingresar"));
    expect(decide(READY, null, "/panel/acceso")).toEqual(to("/panel/ingresar"));
    expect(decide(READY, null, "/panel/ingresar")).toEqual(show);
    expect(decide(READY, null, "/panel/recuperar")).toEqual(show);
  });

  it("with a full session: the panel; reclamar, ingresar, recuperar and onboarding go back to /panel", () => {
    expect(decide(READY, "completa", "/panel")).toEqual(show);
    expect(decide(READY, "completa", "/panel/acceso")).toEqual(show);
    for (const path of [
      "/panel/reclamar",
      "/panel/ingresar",
      "/panel/recuperar",
      "/panel/primer-ingreso/nombre",
    ]) {
      expect(decide(READY, "completa", path)).toEqual(to("/panel"));
    }
  });
});

describe("recovery session: only registering a new passkey", () => {
  it.each([settingUp("nombre"), READY])("in %o everything leads to /panel/recuperar", (status) => {
    expect(decide(status, "recuperacion", "/panel")).toEqual(to("/panel/recuperar"));
    expect(decide(status, "recuperacion", "/panel/acceso")).toEqual(to("/panel/recuperar"));
    expect(decide(status, "recuperacion", "/panel/recuperar")).toEqual(show);
  });
});
