import type { Credencial, CredencialVerificada } from "../dominio/acceso";
import type { ErrorDeDominio } from "../dominio/errores";
import type { Result } from "../dominio/result";

/**
 * Las ceremonias de WebAuthn, sin atar core a una librería. Las opciones y las respuestas del
 * navegador viajan como JSON opaco: core solo guarda el desafío y decide con qué `rpId` y origen verificar.
 */
export type EntradaOpcionesDeRegistro = {
  readonly rpId: string;
  readonly rpNombre: string;
  /** base64url del id aleatorio del dueño (`acceso.webauthn_user_id`). */
  readonly webauthnUserId: string;
  readonly nombreDeUsuario: string;
  /** Nunca vacío: Chrome falla tras escanear un QR si `user.displayName` va vacío. */
  readonly nombreVisible: string;
  readonly excluir: readonly { readonly id: string; readonly transportes: readonly string[] }[];
};

export type EntradaVerificarRegistro = {
  readonly respuesta: unknown;
  readonly desafio: string;
  readonly origen: string;
  readonly rpId: string;
};

export type EntradaVerificarIngreso = EntradaVerificarRegistro & { readonly credencial: Credencial };

export type OpcionesDeCeremonia = { readonly opciones: unknown; readonly desafio: string };

export interface CeremoniaWebAuthn {
  opcionesDeRegistro(e: EntradaOpcionesDeRegistro): Promise<OpcionesDeCeremonia>;
  verificarRegistro(e: EntradaVerificarRegistro): Promise<Result<CredencialVerificada, ErrorDeDominio>>;
  opcionesDeIngreso(e: { readonly rpId: string }): Promise<OpcionesDeCeremonia>;
  verificarIngreso(e: EntradaVerificarIngreso): Promise<Result<{ nuevoContador: number }, ErrorDeDominio>>;
}
