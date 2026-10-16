import { type DomainError, domainError, type ErrorCode } from "../packages/core/index";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export type ErrorBody = {
  error: { code: string; message?: string; details?: Record<string, unknown> };
};

/** HTTP status of each domain error; the rest is invalid input → 422. */
const STATUSES: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  PRODUCT_NOT_FOUND: 404,
  NOT_AUTHENTICATED: 401,
  UNKNOWN_PASSKEY: 401,
  ORIGIN_NOT_ALLOWED: 403,
  ACCESS_LIMITED: 403,
  STORE_ALREADY_CLAIMED: 409,
  PASSKEY_ALREADY_REGISTERED: 409,
  GITHUB_NOT_CONNECTED: 409,
  ALREADY_UP_TO_DATE: 409,
  GITHUB_MULTIPLE_REPOSITORIES: 409,
  GITHUB_NOT_RESPONDING: 502,
  DOMAIN_IN_USE: 409,
  ROUTES_ALREADY_SET: 409,
  DNS_NOT_RESPONDING: 502,
  TOO_MANY_ATTEMPTS: 429,
};

export const statusFor = (e: DomainError): ContentfulStatusCode => STATUSES[e.code] ?? 422;

export function errorBody(e: DomainError): ErrorBody {
  return {
    error: {
      code: e.code,
      message: e.message,
      ...(e.details !== undefined ? { details: e.details } : {}),
    },
  };
}

export function respondDomainError(c: Context, e: DomainError) {
  const retry = e.details?.retryInSeconds;
  if (e.code === "TOO_MANY_ATTEMPTS" && typeof retry === "number") {
    c.header("Retry-After", String(retry));
  }
  return c.json(errorBody(e), statusFor(e));
}

export const notAuthenticated = (c: Context) =>
  respondDomainError(c, domainError("NOT_AUTHENTICATED", "You have to sign in to your store"));

export const accessLimited = (c: Context) =>
  respondDomainError(c, domainError("ACCESS_LIMITED", "This access can't do that"));

export const originNotAllowed = (c: Context) =>
  respondDomainError(
    c,
    domainError("ORIGIN_NOT_ALLOWED", "The request doesn't come from your store's address"),
  );

export const notFound = (c: Context) =>
  c.json<ErrorBody>({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);

export const internalError = (c: Context, cause: unknown) => {
  console.error("Internal API error", cause);
  return c.json<ErrorBody>({ error: { code: "INTERNAL" } }, 500);
};
