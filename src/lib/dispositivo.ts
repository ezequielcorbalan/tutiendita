/** Nombre legible de la passkey a partir del user-agent ("iPhone", "Windows"…); se puede editar después. */
const PATRONES: readonly [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "Chromebook"],
  [/Windows/, "Windows"],
  [/Macintosh|Mac OS X/, "Mac"],
  [/Linux/, "Linux"],
];

export function nombreDeDispositivo(userAgent: string | undefined | null): string {
  if (!userAgent) return "Dispositivo";
  return PATRONES.find(([patron]) => patron.test(userAgent))?.[1] ?? "Dispositivo";
}
