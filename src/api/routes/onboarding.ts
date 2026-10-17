import { ONBOARDING_STEPS } from "../../packages/core/index";
import { Hono } from "hono";
import { z } from "zod";
import { build } from "../../container";
import { respondDomainError } from "../errors";
import { requireSession } from "../middlewares/session";
import type { ApiEnv } from "../types";
import { validate } from "../validation";

/** Onboarding screens 2 to 5 and moving between steps. All with a full session. */
const ownerOnly = requireSession("completa");

const stepSchema = z.object({
  step: z.enum(ONBOARDING_STEPS as [string, ...string[]], { message: "Unknown step" }),
  skipped: z.boolean().optional(),
});

// Core validates the language (INVALID_LANGUAGE); here only the length is bounded.
const language = z.string().max(10);

export const storeRoutes = new Hono<ApiEnv>()
  .put(
    "/",
    ownerOnly,
    validate("json", z.object({ name: z.string().max(200), language: language.optional() })),
    async (c) => {
      const { name, language } = c.req.valid("json");
      const r = await build(c.env).onboarding.saveStoreName({
        name,
        ...(language !== undefined ? { language } : {}),
      });
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json({ name: r.value.name, currency: r.value.currency, language: r.value.language });
    },
  )
  .put("/language", ownerOnly, validate("json", z.object({ language })), async (c) => {
    const r = await build(c.env).onboarding.changeLanguage(c.req.valid("json"));
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json({ language: r.value.language });
  })
  .put("/heartbeat", ownerOnly, validate("json", z.object({ enabled: z.boolean() })), async (c) => {
    const r = await build(c.env).heartbeat.setEnabled(c.req.valid("json").enabled);
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json({ enabled: r.value.heartbeatEnabled });
  });

export const paymentMethodRoutes = new Hono<ApiEnv>()
  .put("/whatsapp", ownerOnly, validate("json", z.object({ number: z.string().max(40) })), async (c) => {
    const r = await build(c.env).onboarding.saveWhatsapp(c.req.valid("json"));
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json(r.value);
  })
  .put(
    "/transfer",
    ownerOnly,
    validate("json", z.object({ account: z.string().max(60), holder: z.string().max(200) })),
    async (c) => {
      const r = await build(c.env).onboarding.saveTransfer(c.req.valid("json"));
      if (!r.ok) return respondDomainError(c, r.error);
      return c.json(r.value);
    },
  );

export const onboardingRoutes = new Hono<ApiEnv>().post(
  "/advance",
  ownerOnly,
  validate("json", stepSchema),
  async (c) => {
    const { step, skipped } = c.req.valid("json");
    const r = await build(c.env).onboarding.advance({
      step: step as (typeof ONBOARDING_STEPS)[number],
      ...(skipped !== undefined ? { skipped } : {}),
    });
    if (!r.ok) return respondDomainError(c, r.error);
    return c.json(r.value);
  },
);
