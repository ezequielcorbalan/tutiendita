import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import type { ErrorBody } from "./errors";

type Target = "json" | "form";

/** Body validation with zod: errors → 422 INVALID_INPUT with the first message of each field. */
export const validate = <T extends ZodType>(target: Target, schema: T, message = "Invalid input") =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join(".") || "(body)";
      fields[field] ??= issue.message;
    }
    return c.json<ErrorBody>({ error: { code: "INVALID_INPUT", message, details: { fields } } }, 422);
  });
