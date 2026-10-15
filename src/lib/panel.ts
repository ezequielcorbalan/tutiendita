import { type EstadoDeLaTienda, PASOS_DEL_PRIMER_INGRESO, type TipoSesion } from "../paquetes/core/index";

/**
 * A dónde puede ir el comerciante dentro de /panel según el estado de la tienda y su sesión.
 * Función pura: la usa el middleware de Astro y se testea sin build.
 */
export type DecisionDelPanel = { tipo: "mostrar" } | { tipo: "redirigir"; a: string };

const MOSTRAR: DecisionDelPanel = { tipo: "mostrar" };
const ir = (a: string): DecisionDelPanel => ({ tipo: "redirigir", a });
const PRIMER_INGRESO = "/panel/primer-ingreso/";

const soloEstas = (ruta: string, permitidas: readonly string[], destino: string): DecisionDelPanel =>
  permitidas.includes(ruta) ? MOSTRAR : ir(destino);

export function decidirRutaDelPanel(e: {
  estado: EstadoDeLaTienda;
  sesion: TipoSesion | null;
  ruta: string;
}): DecisionDelPanel {
  const ruta = e.ruta.length > 1 ? e.ruta.replace(/\/+$/, "") : e.ruta;
  const { estado } = e;

  if (estado.estado === "sin-reclamar") {
    // Con el código ya validado, lo que falta es crear la passkey.
    return e.sesion === "reclamo"
      ? soloEstas(ruta, ["/panel/reclamar", `${PRIMER_INGRESO}acceso`], `${PRIMER_INGRESO}acceso`)
      : soloEstas(ruta, ["/panel/reclamar"], "/panel/reclamar");
  }
  if (e.sesion === "recuperacion") return soloEstas(ruta, ["/panel/recuperar"], "/panel/recuperar");
  if (e.sesion !== "completa")
    return soloEstas(ruta, ["/panel/ingresar", "/panel/recuperar"], "/panel/ingresar");

  if (estado.estado === "configurando") {
    const actual = `${PRIMER_INGRESO}${estado.paso}`;
    if (!ruta.startsWith(PRIMER_INGRESO)) return ir(actual);
    const pedido = PASOS_DEL_PRIMER_INGRESO.indexOf(ruta.slice(PRIMER_INGRESO.length) as never);
    return pedido !== -1 && pedido <= PASOS_DEL_PRIMER_INGRESO.indexOf(estado.paso) ? MOSTRAR : ir(actual);
  }

  const soloSinSesion = ["/panel/reclamar", "/panel/ingresar", "/panel/recuperar"];
  return soloSinSesion.includes(ruta) || ruta.startsWith(PRIMER_INGRESO) ? ir("/panel") : MOSTRAR;
}
