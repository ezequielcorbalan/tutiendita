import type { PasoPrimerIngreso } from "../dominio/acceso";
import type { RepositorioAcceso } from "../puertos/repositorio-acceso";

/**
 * `sin-reclamar`: recién desplegada con el botón, sin dueño (la portada muestra "Tu tiendita está lista"
 * con el botón para reclamarla). `configurando`: hay dueño y el primer ingreso está a medias (la portada
 * dice "Estamos preparando la tienda"). `lista`: primer ingreso completado, la portada muestra el catálogo.
 */
export type EstadoDeLaTienda =
  | { readonly estado: "sin-reclamar" }
  | { readonly estado: "configurando"; readonly paso: PasoPrimerIngreso }
  | { readonly estado: "lista" };

export const obtenerEstadoDeLaTienda =
  (deps: { acceso: RepositorioAcceso }) => async (): Promise<EstadoDeLaTienda> => {
    const acceso = await deps.acceso.obtener();
    if (acceso === null) return { estado: "sin-reclamar" };
    if (acceso.primerIngresoCompletadoEn === null)
      return { estado: "configurando", paso: acceso.pasoPrimerIngreso };
    return { estado: "lista" };
  };
