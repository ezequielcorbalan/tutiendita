/** Owner's sign-in password for devices without passkeys (ADR-020). Stored as a slow hash, see the port. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 200;

/** Words that make a password guessable even when it is long enough. Lowercase fragments. */
const COMMON_FRAGMENTS = ["password", "contrase", "tiendita", "qwerty", "123456", "abcdef", "111111"];

const CLASSES = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/];

/** `null` if the password is acceptable; otherwise the reason, for the UI text. */
export function passwordProblem(password: string): "TOO_SHORT" | "TOO_WEAK" | null {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) return "TOO_SHORT";
  const classes = CLASSES.filter((rule) => rule.test(password)).length;
  if (classes < 3) return "TOO_WEAK";
  const lower = password.toLowerCase();
  if (COMMON_FRAGMENTS.some((fragment) => lower.includes(fragment))) return "TOO_WEAK";
  return null;
}
