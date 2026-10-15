/** Dates are stored in D1 as ISO 8601 text (UTC), like the rest of the schema. */
export const iso = (d: Date): string => d.toISOString();
export const dateOrNull = (s: string | null): Date | null => (s === null ? null : new Date(s));
