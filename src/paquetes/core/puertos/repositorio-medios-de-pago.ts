import type { MedioDePagoConfigurado, TipoMedioDePago } from "../dominio/medio-de-pago";

export interface RepositorioMediosDePago {
  obtener<T extends TipoMedioDePago>(tipo: T): Promise<Extract<MedioDePagoConfigurado, { tipo: T }> | null>;
  guardar(m: MedioDePagoConfigurado): Promise<void>;
}
