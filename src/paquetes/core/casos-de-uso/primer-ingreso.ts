import type { PasoPrimerIngreso } from "../dominio/acceso";
import { type ErrorDeDominio, errorDeDominio } from "../dominio/errores";
import {
  type ConfiguracionTransferencia,
  type ConfiguracionWhatsapp,
  PLANTILLA_WHATSAPP,
  validarTransferencia,
  validarWhatsapp,
} from "../dominio/medio-de-pago";
import {
  esPasoDelPrimerIngreso,
  PASOS_DEL_PRIMER_INGRESO,
  PASOS_SALTEABLES,
  siguientePaso,
} from "../dominio/primer-ingreso";
import { err, ok, type Result } from "../dominio/result";
import { conIdioma, conWhatsapp, crearTienda, renombrar, type Tienda } from "../dominio/tienda";
import type { GeneradorIds } from "../puertos/generador-ids";
import type { Reloj } from "../puertos/reloj";
import type { RepositorioAcceso } from "../puertos/repositorio-acceso";
import type { RepositorioMediosDePago } from "../puertos/repositorio-medios-de-pago";
import type { RepositorioTienda } from "../puertos/repositorio-tienda";

export type DepsPrimerIngreso = {
  acceso: RepositorioAcceso;
  tienda: RepositorioTienda;
  medios: RepositorioMediosDePago;
  reloj: Reloj;
  ids: GeneradorIds;
};

const pasoInvalido = (mensaje: string, detalle?: Record<string, unknown>) =>
  err(errorDeDominio("PASO_INVALIDO", mensaje, detalle));

/** Pantalla 2: crea la tienda (moneda ARS, descripción vacía) o la renombra; con `idioma`, también lo fija. */
export const guardarNombreDeLaTienda =
  (deps: DepsPrimerIngreso) =>
  async (e: { nombre: string; idioma?: string }): Promise<Result<Tienda, ErrorDeDominio>> => {
    const actual = await deps.tienda.obtener();
    let tienda = actual === null ? crearTienda(e, { id: deps.ids.nuevoId() }) : renombrar(actual, e.nombre);
    if (tienda.ok && actual !== null && e.idioma !== undefined) tienda = conIdioma(tienda.valor, e.idioma);
    if (!tienda.ok) return tienda;
    await deps.tienda.guardar(tienda.valor, deps.reloj.ahora());
    return tienda;
  };

/** Desde el panel: el idioma en que se muestran la tienda y el panel. */
export const cambiarIdiomaDeLaTienda =
  (deps: DepsPrimerIngreso) =>
  async (e: { idioma: string }): Promise<Result<Tienda, ErrorDeDominio>> => {
    const actual = await deps.tienda.obtener();
    if (actual === null) return pasoInvalido("Primero elegí el nombre de tu tienda");
    const tienda = conIdioma(actual, e.idioma);
    if (!tienda.ok) return tienda;
    await deps.tienda.guardar(tienda.valor, deps.reloj.ahora());
    return tienda;
  };

/** Pantalla 3: el canal por el que llegan los pedidos; también queda como contacto de la tienda. */
export const guardarWhatsapp =
  (deps: DepsPrimerIngreso) =>
  async (e: { numero: string }): Promise<Result<ConfiguracionWhatsapp, ErrorDeDominio>> => {
    const tienda = await deps.tienda.obtener();
    if (tienda === null) return pasoInvalido("Primero elegí el nombre de tu tienda");
    const numero = validarWhatsapp(e.numero);
    if (!numero.ok) return numero;
    const ahora = deps.reloj.ahora();
    const configuracion = { numero: numero.valor, plantilla: PLANTILLA_WHATSAPP };
    await deps.medios.guardar({ tipo: "whatsapp", activo: true, configuracion, actualizadoEn: ahora });
    await deps.tienda.guardar(conWhatsapp(tienda, numero.valor), ahora);
    return ok(configuracion);
  };

/** Pantalla 4 (salteable): alias o CBU/CVU y titular. */
export const guardarTransferencia =
  (deps: DepsPrimerIngreso) =>
  async (e: {
    cuenta: string;
    titular: string;
  }): Promise<Result<ConfiguracionTransferencia, ErrorDeDominio>> => {
    const configuracion = validarTransferencia(e);
    if (!configuracion.ok) return configuracion;
    await deps.medios.guardar({
      tipo: "transferencia",
      activo: true,
      configuracion: configuracion.valor,
      actualizadoEn: deps.reloj.ahora(),
    });
    return configuracion;
  };

export type ProgresoDelPrimerIngreso = { paso: PasoPrimerIngreso; completado: boolean };

/** Completar un paso obligatorio exige que su dato esté guardado. */
async function datoGuardado(deps: DepsPrimerIngreso, paso: PasoPrimerIngreso): Promise<boolean> {
  switch (paso) {
    case "nombre":
      return (await deps.tienda.obtener()) !== null;
    case "whatsapp":
      return (await deps.medios.obtener("whatsapp")) !== null;
    case "transferencia":
      return (await deps.medios.obtener("transferencia")) !== null;
    default:
      return true;
  }
}

/**
 * Completa o saltea `paso`. Tiene que ser el paso actual o uno anterior (se puede volver atrás); el
 * progreso nunca retrocede. Al terminar el último se marca el primer ingreso como completado.
 */
export const avanzarPrimerIngreso =
  (deps: DepsPrimerIngreso) =>
  async (e: {
    paso: PasoPrimerIngreso;
    salteado?: boolean;
  }): Promise<Result<ProgresoDelPrimerIngreso, ErrorDeDominio>> => {
    const estado = await deps.acceso.obtener();
    if (estado === null) return pasoInvalido("La tienda todavía no tiene dueño");
    if (estado.primerIngresoCompletadoEn !== null)
      return ok({ paso: estado.pasoPrimerIngreso, completado: true });
    if (!esPasoDelPrimerIngreso(e.paso)) return pasoInvalido("Paso desconocido", { paso: e.paso });
    const actual = PASOS_DEL_PRIMER_INGRESO.indexOf(estado.pasoPrimerIngreso);
    const pedido = PASOS_DEL_PRIMER_INGRESO.indexOf(e.paso);
    if (pedido > actual)
      return pasoInvalido("Todavía no llegaste a ese paso", { actual: estado.pasoPrimerIngreso });
    if (e.salteado === true && !PASOS_SALTEABLES.includes(e.paso)) {
      return pasoInvalido("Este paso no se puede saltear", { paso: e.paso });
    }
    if (e.salteado !== true && !(await datoGuardado(deps, e.paso))) {
      return pasoInvalido("Falta completar este paso", { paso: e.paso });
    }
    if (pedido < actual) return ok({ paso: estado.pasoPrimerIngreso, completado: false });
    const siguiente = siguientePaso(e.paso);
    if (siguiente === "completado") {
      await deps.acceso.guardarPrimerIngreso(e.paso, deps.reloj.ahora());
      return ok({ paso: e.paso, completado: true });
    }
    await deps.acceso.guardarPrimerIngreso(siguiente, null);
    return ok({ paso: siguiente, completado: false });
  };
