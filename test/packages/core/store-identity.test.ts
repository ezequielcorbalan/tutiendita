import { describe, expect, it } from "vitest";
import { BRAND_COLOR } from "../../../src/packages/core/domain/settings";
import { createStore, type Store } from "../../../src/packages/core/domain/store";
import { getBrandColor, updateStoreIdentity } from "../../../src/packages/core/use-cases/store-identity";
import {
  FixedClock,
  InMemoryImageStorage,
  InMemorySettingsRepository,
  InMemoryStoreRepository,
} from "./doubles/in-memory";

const png = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  mimeType: "image/png",
};

function setup(store: Store | null = unwrap(createStore({ name: "La Espiga" }, { id: "t1" }))) {
  const deps = {
    store: new InMemoryStoreRepository(store),
    settings: new InMemorySettingsRepository(),
    images: new InMemoryImageStorage(),
    clock: new FixedClock(new Date("2026-10-22T10:00:00Z")),
  };
  return { ...deps, update: updateStoreIdentity(deps), color: getBrandColor(deps) };
}

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error("expected ok");
  return r.value;
}

const base = {
  name: "Panadería La Espiga",
  description: "  Pan de masa madre en Villa Crespo ",
  color: "azul",
};

describe("updateStoreIdentity", () => {
  it("renames, trims the tagline, stores the colour and the logo", async () => {
    const s = setup();
    const r = await s.update({ ...base, logo: png });
    expect(r).toMatchObject({
      ok: true,
      value: {
        color: "azul",
        store: {
          name: "Panadería La Espiga",
          description: "Pan de masa madre en Villa Crespo",
          logoKey: "img-1",
        },
      },
    });
    expect((await s.store.get())?.logoKey).toBe("img-1");
    expect(await s.settings.get(BRAND_COLOR)).toBe("azul");
    expect(await s.color()).toBe("azul");
  });

  it("replacing the logo deletes the previous file; removing it leaves none", async () => {
    const s = setup();
    await s.update({ ...base, logo: png });
    await s.update({ ...base, logo: png });
    expect([...s.images.files.keys()]).toEqual(["img-2"]);
    await s.update({ ...base, removeLogo: true });
    expect(s.images.files.size).toBe(0);
    expect((await s.store.get())?.logoKey).toBeNull();
  });

  it("without logo nor removeLogo the current logo stays", async () => {
    const s = setup();
    await s.update({ ...base, logo: png });
    await s.update(base);
    expect((await s.store.get())?.logoKey).toBe("img-1");
  });

  it.each([
    ["an empty name", { ...base, name: " " }, "EMPTY_NAME"],
    ["a tagline over 200 characters", { ...base, description: "x".repeat(201) }, "DESCRIPTION_TOO_LONG"],
    ["a colour outside the palette", { ...base, color: "#ff0000" }, "INVALID_BRAND_COLOR"],
    [
      "a logo that is not an image",
      { ...base, logo: { bytes: new Uint8Array(4), mimeType: "image/png" } },
      "INVALID_IMAGE",
    ],
  ])("rejects %s without saving anything", async (_case, input, code) => {
    const s = setup();
    expect(await s.update(input)).toMatchObject({ ok: false, error: { code } });
    expect((await s.store.get())?.name).toBe("La Espiga");
    expect(s.images.files.size).toBe(0);
    expect(await s.settings.get(BRAND_COLOR)).toBeNull();
  });

  it("needs the store from onboarding", async () => {
    expect(await setup(null).update(base)).toMatchObject({ ok: false, error: { code: "INVALID_STEP" } });
  });
});

describe("getBrandColor", () => {
  it("is the default when unset or unknown", async () => {
    const s = setup();
    expect(await s.color()).toBe("verde");
    await s.settings.set(BRAND_COLOR, "fucsia", new Date());
    expect(await s.color()).toBe("verde");
  });
});
