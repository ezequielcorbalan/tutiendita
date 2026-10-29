import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { ProductJson } from "../../src/lib/product-json";
import { clearD1, clearR2, create, PNG_1X1, send, startTestSession, validCreation } from "../helpers";

type ErrorBody = { error: { code: string } };
const errorCode = async (res: Response) => ((await res.json()) as ErrorBody).error.code;
const withoutBucket = { ...env, IMAGENES: undefined } as unknown as Env;

beforeEach(async () => {
  await clearD1();
  await clearR2();
});

const file = (name: string) => ({ bytes: PNG_1X1, type: "image/png", name });
const { image: _single, ...noImage } = validCreation();

describe("gallery and per-value photos through the API (PRO)", () => {
  it("creates with three photos and a value pointing to the second", async () => {
    const options = JSON.stringify([
      {
        name: "Color",
        values: [
          { label: "Red", price_delta: 0, image_ref: { upload: 1 } },
          { label: "Blue", price_delta: 0 },
        ],
      },
    ]);
    const res = await create({
      ...noImage,
      gallery: JSON.stringify([{ upload: 0 }, { upload: 1 }, { upload: 2 }]),
      files: [file("a.png"), file("b.png"), file("c.png")],
      options,
    });
    expect(res.status).toBe(201);
    const p = (await res.json()) as ProductJson;
    expect(p.images).toHaveLength(3);
    const [red, blue] = p.options[0]?.values ?? [];
    expect(red?.imageKey).toBe(p.images[1]?.key);
    expect(red?.imageUrl).toBe(p.images[1]?.url);
    expect(blue).toMatchObject({ imageKey: null, imageUrl: null });
  });

  it("rejects image together with gallery (422)", async () => {
    const res = await create({
      ...validCreation(),
      gallery: JSON.stringify([{ upload: 0 }]),
      files: [file("a.png")],
    });
    expect(res.status).toBe(422);
  });

  it("rejects a gap in the files (422)", async () => {
    const res = await create({
      ...noImage,
      gallery: JSON.stringify([{ upload: 0 }]),
      files: [file("a.png")],
      options: JSON.stringify([
        { name: "C", values: [{ label: "R", price_delta: 0, image_ref: { upload: 3 } }] },
      ]),
    });
    expect(res.status).toBe(422);
  });

  it("rejects more than 8 photos", async () => {
    const res = await create({
      ...noImage,
      gallery: JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ upload: i }))),
    });
    expect(res.status).toBe(422);
  });
});

describe("photo storage through the API", () => {
  it("without a session it answers 401 and from another origin 403", async () => {
    expect((await send("GET", "/api/photos/status")).status).toBe(401);
    const cookies = await startTestSession("completa");
    const foreign = await send("POST", "/api/photos/revert", undefined, {
      cookies,
      origin: "https://other.example",
    });
    expect(foreign.status).toBe(403);
  });

  it("with the R2 binding the status is professional", async () => {
    const cookies = await startTestSession("completa");
    const res = await send("GET", "/api/photos/status", undefined, { cookies });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mode: "professional" });
  });

  it("without the binding the status is basic with the quota", async () => {
    const cookies = await startTestSession("completa");
    const res = await send("GET", "/api/photos/status", undefined, { cookies, environment: withoutBucket });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "basic", used: 0, max: 200 });
  });

  it("without GitHub connected it cannot enable professional photos (409)", async () => {
    const cookies = await startTestSession("completa");
    const res = await send("POST", "/api/photos/enable", undefined, { cookies, environment: withoutBucket });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("GITHUB_NOT_CONNECTED");
  });
});
