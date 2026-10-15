import { type DomainError, domainError } from "./errors";
import { err, ok, type Result } from "./result";

/**
 * A payment method tells the buyer how to pay the seller. It does not move money.
 * For now the WhatsApp and Transfer configuration is stored; checkout comes in another sub-project.
 */
export type PaymentMethod = {
  readonly type: string;
  readonly name: string;
};

export type WhatsappConfig = {
  /** E.164: `+5491122334455`. */
  readonly number: string;
  readonly template: string;
};

export type TransferConfig = {
  /** Stored in D1: values stay as-is. */
  readonly accountType: "alias" | "cbu";
  readonly account: string;
  readonly holder: string;
};

export type ConfiguredPaymentMethod =
  | {
      readonly type: "whatsapp";
      readonly active: boolean;
      readonly config: WhatsappConfig;
      readonly updatedAt: Date;
    }
  | {
      readonly type: "transferencia";
      readonly active: boolean;
      readonly config: TransferConfig;
      readonly updatedAt: Date;
    };

/** Stored in D1: the `type` values (`whatsapp`, `transferencia`) stay in Spanish. */
export type PaymentMethodType = ConfiguredPaymentMethod["type"];

/** Message WhatsApp opens with when ordering (buyer-facing text, Spanish on purpose); editable later from the panel. */
export const WHATSAPP_TEMPLATE = "¡Hola! Quiero hacer este pedido:";

const E164 = /^[1-9]\d{7,14}$/;
const AR_NATIONAL_LENGTH = 10;

/** Without the long-distance 0 and without the mobile 15 people put after the area code. */
function argentineNational(digits: string): string {
  const n = digits.startsWith("0") ? digits.slice(1) : digits;
  if (n.length !== AR_NATIONAL_LENGTH + 2) return n;
  // Area codes of 2, 3 or 4 digits: the 15 goes right after.
  for (const k of [2, 3, 4]) {
    if (n.slice(k, k + 2) === "15") return n.slice(0, k) + n.slice(k + 2);
  }
  return n;
}

/**
 * Accepts the number as people write it (spaces, hyphens, parentheses, 0, 15, with or without +54 9) and
 * returns it in E.164. Without an international prefix it assumes Argentina; for WhatsApp, Argentine
 * mobiles carry the 9 after the 54.
 */
export function validateWhatsapp(number: string): Result<string, DomainError> {
  const invalid = err(
    domainError("INVALID_WHATSAPP", "Check the number: area code and number, e.g. 11 2233-4455"),
  );
  const clean = number.trim();
  let digits = clean.replace(/\D/g, "");
  let international = clean.startsWith("+");
  if (!international && digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }
  if (!international && digits.startsWith("54") && digits.length >= AR_NATIONAL_LENGTH + 2)
    international = true;

  if (international && !digits.startsWith("54")) return E164.test(digits) ? ok(`+${digits}`) : invalid;

  let national = international ? digits.slice(2) : digits;
  if (international && national.startsWith("9")) national = national.slice(1);
  national = argentineNational(national);
  // A number starting with 15 without an area code cannot be completed.
  if (!/^\d{10}$/.test(national) || national.startsWith("15") || national.startsWith("0")) return invalid;
  return ok(`+549${national}`);
}

const BLOCK_1_WEIGHTS = [7, 1, 3, 9, 7, 1, 3];
const BLOCK_2_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function checkDigitValid(block: string, weights: readonly number[]): boolean {
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(block[i]), 0);
  return (10 - (sum % 10)) % 10 === Number(block[weights.length]);
}

/** CBU or CVU: 22 digits in two blocks (8 and 14), each with its check digit. */
export const isValidCbu = (cbu: string): boolean =>
  /^\d{22}$/.test(cbu) &&
  checkDigitValid(cbu.slice(0, 8), BLOCK_1_WEIGHTS) &&
  checkDigitValid(cbu.slice(8), BLOCK_2_WEIGHTS);

const ALIAS = /^[A-Za-z0-9.-]{6,20}$/;
export const MAX_HOLDER_LENGTH = 80;

/** Alias (6 to 20: letters, digits, dot and hyphen) or CBU/CVU; which one is detected automatically. */
export function validateTransfer(e: {
  account: string;
  holder: string;
}): Result<TransferConfig, DomainError> {
  const invalid = (field: string, message: string) =>
    err(domainError("INVALID_TRANSFER", message, { field }));
  const holder = e.holder.trim();
  const account = e.account.trim();
  const digitsOnly = account.replace(/[\s-]/g, "");
  let config: TransferConfig;
  if (/^\d+$/.test(digitsOnly)) {
    if (!isValidCbu(digitsOnly)) {
      return invalid("account", "The CBU or CVU must have 22 digits and be valid.");
    }
    config = { accountType: "cbu", account: digitsOnly, holder };
  } else if (ALIAS.test(account)) {
    config = { accountType: "alias", account, holder };
  } else {
    return invalid("account", "The alias must be 6 to 20 characters: letters, digits, dot and hyphen.");
  }
  if (holder === "" || holder.length > MAX_HOLDER_LENGTH) {
    return invalid("holder", "Enter the account holder's name.");
  }
  return ok(config);
}
