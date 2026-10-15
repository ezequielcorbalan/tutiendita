import type { PasoPrimerIngreso } from "./acceso";

/** Las cinco pantallas del primer ingreso, en orden. */
export const PASOS_DEL_PRIMER_INGRESO: readonly PasoPrimerIngreso[] = [
  "acceso",
  "nombre",
  "whatsapp",
  "transferencia",
  "producto",
];

/** WhatsApp es obligatorio (decisión 3): solo transferencia y primer producto se pueden saltear. */
export const PASOS_SALTEABLES: readonly PasoPrimerIngreso[] = ["transferencia", "producto"];

export const esPasoDelPrimerIngreso = (paso: string): paso is PasoPrimerIngreso =>
  (PASOS_DEL_PRIMER_INGRESO as readonly string[]).includes(paso);

/** 1 a 5, para mostrar "Paso n de 5". */
export const numeroDePaso = (paso: PasoPrimerIngreso): number => PASOS_DEL_PRIMER_INGRESO.indexOf(paso) + 1;

export const siguientePaso = (paso: PasoPrimerIngreso): PasoPrimerIngreso | "completado" =>
  PASOS_DEL_PRIMER_INGRESO[PASOS_DEL_PRIMER_INGRESO.indexOf(paso) + 1] ?? "completado";
