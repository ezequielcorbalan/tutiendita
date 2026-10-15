/** Las fechas se guardan en D1 como texto ISO 8601 (UTC), igual que en el resto del esquema. */
export const iso = (d: Date): string => d.toISOString();
export const fechaONull = (s: string | null): Date | null => (s === null ? null : new Date(s));
