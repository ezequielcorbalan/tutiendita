export type PropositoDesafio = "registro" | "ingreso";

export type Desafio = {
  readonly id: string;
  readonly desafio: string;
  readonly proposito: PropositoDesafio;
  /** Sesión que pidió las opciones de registro (null en el ingreso). */
  readonly sesionIdHash: string | null;
  /** `user.id` que se mandó en las opciones de registro (el navegador no lo devuelve al registrar). */
  readonly webauthnUserId: string | null;
  readonly expiraEn: Date;
};

export interface RepositorioDesafios {
  guardar(d: Desafio): Promise<void>;
  /** Lee y borra: un desafío se usa una sola vez, aunque esté vencido. */
  consumir(id: string): Promise<Desafio | null>;
}
