/** Readable passkey name from the user-agent ("iPhone", "Windows"…); it can be edited later. */
const PATTERNS: readonly [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "Chromebook"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Linux/, "Linux"],
];

export function deviceName(userAgent: string | undefined | null): string {
  // "Dispositivo" is shown to the merchant as the passkey name: user text, stays in Spanish.
  if (!userAgent) return "Dispositivo";
  return PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "Dispositivo";
}
