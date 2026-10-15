export type Ok<T> = { readonly ok: true; readonly valor: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(valor: T): Ok<T> => ({ ok: true, valor });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });
export const esOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const esErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;
