export type ErrorCode =
  | "INVALID_PRICE"
  | "NO_IMAGE"
  | "EMPTY_NAME"
  | "INVALID_SLUG"
  | "INVALID_IMAGE"
  | "PRODUCT_PAUSED"
  | "PRODUCT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_HAS_PRODUCTS"
  | "INVALID_STATUS"
  | "INVALID_CODE"
  | "STORE_ALREADY_CLAIMED"
  | "CHALLENGE_EXPIRED"
  | "PASSKEY_NOT_VERIFIED"
  | "UNKNOWN_PASSKEY"
  | "PASSKEY_ALREADY_REGISTERED"
  | "ORIGIN_NOT_ALLOWED"
  | "NOT_AUTHENTICATED"
  | "ACCESS_LIMITED"
  | "TOO_MANY_ATTEMPTS"
  | "LAST_PASSKEY"
  | "INVALID_WHATSAPP"
  | "INVALID_TRANSFER"
  | "INVALID_STEP"
  | "INVALID_LANGUAGE"
  | "GITHUB_NOT_CONNECTED"
  | "GITHUB_NOT_RESPONDING"
  | "GITHUB_MULTIPLE_REPOSITORIES"
  | "ALREADY_UP_TO_DATE"
  | "INVALID_CART"
  | "PRODUCT_UNAVAILABLE"
  | "INVALID_OPTIONS"
  | "INVALID_SELECTION";

export type DomainError = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
};

export function domainError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): DomainError {
  return details === undefined ? { code, message } : { code, message, details };
}
