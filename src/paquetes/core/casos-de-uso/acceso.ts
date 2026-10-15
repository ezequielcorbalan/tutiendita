import {
  type Credencial,
  DURACION_DESAFIO,
  DURACION_SESION,
  debeRenovar,
  type EstadoDelAcceso,
  hostDeOrigen,
  nuevaSesion,
  type OrigenPermitido,
  type Sesion,
  sesionVigente,
  type TipoSesion,
} from "../dominio/acceso";
import {
  aBase64Url,
  BYTES_DE_CODIGO,
  codigoDesdeBytes,
  formatearCodigo,
  normalizarCodigo,
} from "../dominio/codigo";
import { type ErrorDeDominio, errorDeDominio } from "../dominio/errores";
import { err, ok, type Result } from "../dominio/result";
import type { CeremoniaWebAuthn } from "../puertos/ceremonia-webauthn";
import type { Criptografia, HashDelCodigoDeReclamo } from "../puertos/criptografia";
import { type LimitadorDeIntentos, segundosHastaLaProximaVentana } from "../puertos/limitador-de-intentos";
import type { Reloj } from "../puertos/reloj";
import type { RepositorioAcceso } from "../puertos/repositorio-acceso";
import type { RepositorioCredenciales } from "../puertos/repositorio-credenciales";
import type { Desafio, PropositoDesafio, RepositorioDesafios } from "../puertos/repositorio-desafios";
import type { RepositorioSesiones } from "../puertos/repositorio-sesiones";
import type { RepositorioTienda } from "../puertos/repositorio-tienda";

export type DepsAcceso = {
  acceso: RepositorioAcceso;
  credenciales: RepositorioCredenciales;
  sesiones: RepositorioSesiones;
  desafios: RepositorioDesafios;
  limitador: LimitadorDeIntentos;
  ceremonia: CeremoniaWebAuthn;
  cripto: Criptografia;
  reloj: Reloj;
  tienda: RepositorioTienda;
  hashDelCodigoDeReclamo: HashDelCodigoDeReclamo;
};

/** El token en claro va solo a la cookie; en D1 queda `sesion.idHash`. */
export type SesionIniciada = { token: string; sesion: Sesion };
export type OpcionesParaElNavegador = { opciones: unknown; desafioId: string };

const NOMBRE_POR_DEFECTO = "Dueño de tiendita";
/** Pedidos de opciones de ingreso por IP y ventana (cada uno escribe un desafío en D1; sin sesión). */
export const MAXIMO_DE_PEDIDOS_DE_INGRESO = 30;
const BYTES_DE_TOKEN = 32;

const fallo = <T>(codigo: ErrorDeDominio["codigo"], mensaje: string, detalle?: Record<string, unknown>) =>
  err(errorDeDominio(codigo, mensaje, detalle)) as Result<T, ErrorDeDominio>;

const aleatorio = (deps: DepsAcceso, n = BYTES_DE_TOKEN) => aBase64Url(deps.cripto.bytesAleatorios(n));

async function crearSesion(deps: DepsAcceso, tipo: TipoSesion): Promise<SesionIniciada> {
  const token = aleatorio(deps);
  const ahora = deps.reloj.ahora();
  await deps.sesiones.borrarVencidas(ahora);
  const sesion = nuevaSesion(await deps.cripto.sha256Hex(token), tipo, ahora);
  await deps.sesiones.crear(sesion);
  return { token, sesion };
}

/** Pasa de `reclamo`/`recuperacion` a `completa` con un id nuevo (el viejo no sirve más). */
async function rotarACompleta(deps: DepsAcceso, vieja: Sesion): Promise<SesionIniciada> {
  await deps.sesiones.borrar(vieja.idHash);
  return crearSesion(deps, "completa");
}

async function nuevoCodigoDeRecuperacion(deps: DepsAcceso): Promise<{ codigo: string; hash: string }> {
  const codigo = codigoDesdeBytes(deps.cripto.bytesAleatorios(BYTES_DE_CODIGO));
  return { codigo: formatearCodigo(codigo), hash: await deps.cripto.sha256Hex(codigo) };
}

/**
 * Antes del reclamo, el `rpId` es el host del origen del request (el middleware ya exigió que el
 * `Origin` coincida con él). Después, solo valen los orígenes de la tabla.
 */
async function origenPara(
  deps: DepsAcceso,
  origen: string,
  estado: EstadoDelAcceso | null,
): Promise<Result<OrigenPermitido, ErrorDeDominio>> {
  if (estado === null) {
    const rpId = hostDeOrigen(origen);
    return rpId === null
      ? fallo("ORIGEN_NO_PERMITIDO", "Este origen no puede usar passkeys", { origen })
      : ok({ origen, rpId, principal: true });
  }
  const permitido = (await deps.acceso.origenesPermitidos()).find((o) => o.origen === origen);
  return permitido === undefined
    ? fallo("ORIGEN_NO_PERMITIDO", "Desde esta dirección no se puede entrar a la tienda", { origen })
    : ok(permitido);
}

async function guardarDesafio(
  deps: DepsAcceso,
  desafio: string,
  proposito: PropositoDesafio,
  extra: { sesionIdHash: string | null; webauthnUserId: string | null },
): Promise<string> {
  const id = aleatorio(deps);
  const expiraEn = new Date(deps.reloj.ahora().getTime() + DURACION_DESAFIO);
  await deps.desafios.guardar({ id, desafio, proposito, expiraEn, ...extra });
  return id;
}

async function consumirDesafio(
  deps: DepsAcceso,
  id: string | null | undefined,
  proposito: PropositoDesafio,
  sesionIdHash: string | null,
): Promise<Result<Desafio, ErrorDeDominio>> {
  const d = id ? await deps.desafios.consumir(id) : null;
  const vigente =
    d !== null &&
    d.proposito === proposito &&
    d.sesionIdHash === sesionIdHash &&
    deps.reloj.ahora().getTime() < d.expiraEn.getTime();
  return vigente
    ? ok(d)
    : fallo("DESAFIO_VENCIDO", "Pasó demasiado tiempo o el pedido ya se usó. Probá de nuevo.");
}

async function bloqueado(
  deps: DepsAcceso,
  clave: string,
  maximo?: number,
): Promise<Result<never, ErrorDeDominio> | null> {
  const ahora = deps.reloj.ahora();
  if (!(await deps.limitador.estaBloqueado(clave, ahora, maximo))) return null;
  return fallo("DEMASIADOS_INTENTOS", "Demasiados intentos. Esperá unos minutos y probá de nuevo.", {
    reintentarEnSegundos: segundosHastaLaProximaVentana(ahora),
  });
}

const codigoInvalido = <T>() => fallo<T>("CODIGO_INVALIDO", "El código no es correcto.");
const yaRegistrada = <T>() =>
  fallo<T>("PASSKEY_YA_REGISTRADA", "Esa passkey ya está registrada en tu tienda");

/** Sin dueño, solo una sesión de reclamo registra; con dueño, una de reclamo llegó tarde. */
function chequearSesionParaRegistrar(
  estado: EstadoDelAcceso | null,
  sesion: Sesion,
): Result<true, ErrorDeDominio> {
  if (estado === null && sesion.tipo !== "reclamo") {
    return fallo("ACCESO_LIMITADO", "Primero hay que reclamar la tienda");
  }
  if (estado !== null && sesion.tipo === "reclamo") {
    return fallo("TIENDA_YA_RECLAMADA", "Esta tienda ya tiene dueño");
  }
  return ok(true);
}

export const validarCodigoDeReclamo =
  (deps: DepsAcceso) =>
  async (e: { codigo: string; ip: string }): Promise<Result<SesionIniciada, ErrorDeDominio>> => {
    if ((await deps.acceso.obtener()) !== null) {
      return fallo("TIENDA_YA_RECLAMADA", "Esta tienda ya tiene dueño");
    }
    const clave = `reclamo:${e.ip}`;
    const limite = await bloqueado(deps, clave);
    if (limite) return limite;
    const esperado = deps.hashDelCodigoDeReclamo();
    const hash = await deps.cripto.sha256Hex(normalizarCodigo(e.codigo));
    if (esperado === null || !deps.cripto.igualesEnTiempoConstante(hash, esperado)) {
      await deps.limitador.registrarFallo(clave, deps.reloj.ahora());
      return codigoInvalido();
    }
    return ok(await crearSesion(deps, "reclamo"));
  };

export const iniciarRegistroDePasskey =
  (deps: DepsAcceso) =>
  async (e: { sesion: Sesion; origen: string }): Promise<Result<OpcionesParaElNavegador, ErrorDeDominio>> => {
    const estado = await deps.acceso.obtener();
    const puede = chequearSesionParaRegistrar(estado, e.sesion);
    if (!puede.ok) return puede;
    const origen = await origenPara(deps, e.origen, estado);
    if (!origen.ok) return origen;
    const webauthnUserId = estado?.webauthnUserId ?? aleatorio(deps);
    const tienda = await deps.tienda.obtener();
    const nombre = tienda?.nombre ?? NOMBRE_POR_DEFECTO;
    // Sin dueño, las credenciales que hubieran quedado (plan de emergencia) se borran al reclamar.
    const excluir = estado === null ? [] : await deps.credenciales.listar();
    const { opciones, desafio } = await deps.ceremonia.opcionesDeRegistro({
      rpId: origen.valor.rpId,
      rpNombre: tienda?.nombre ?? "tiendita",
      webauthnUserId,
      nombreDeUsuario: nombre,
      nombreVisible: nombre,
      excluir: excluir.map((c) => ({ id: c.id, transportes: c.transportes })),
    });
    const desafioId = await guardarDesafio(deps, desafio, "registro", {
      sesionIdHash: e.sesion.idHash,
      webauthnUserId,
    });
    return ok({ opciones, desafioId });
  };

export type RegistroCompletado = {
  credencial: Credencial;
  /** Formateado; solo en el reclamo y en la recuperación. Se muestra una sola vez. */
  codigoDeRecuperacion: string | null;
  /** Si la sesión cambió de tipo, la nueva (completa) con su token. */
  sesionNueva: SesionIniciada | null;
};

export const completarRegistroDePasskey =
  (deps: DepsAcceso) =>
  async (e: {
    sesion: Sesion;
    origen: string;
    desafioId: string | null | undefined;
    respuesta: unknown;
    nombreDispositivo: string;
  }): Promise<Result<RegistroCompletado, ErrorDeDominio>> => {
    const desafio = await consumirDesafio(deps, e.desafioId, "registro", e.sesion.idHash);
    if (!desafio.ok) return desafio;
    const estado = await deps.acceso.obtener();
    const puede = chequearSesionParaRegistrar(estado, e.sesion);
    if (!puede.ok) return puede;
    const origen = await origenPara(deps, e.origen, estado);
    if (!origen.ok) return origen;
    const verificada = await deps.ceremonia.verificarRegistro({
      respuesta: e.respuesta,
      desafio: desafio.valor.desafio,
      origen: origen.valor.origen,
      rpId: origen.valor.rpId,
    });
    if (!verificada.ok) return verificada;
    const ahora = deps.reloj.ahora();
    const credencial: Credencial = {
      ...verificada.valor,
      rpId: origen.valor.rpId,
      origen: origen.valor.origen,
      nombre: e.nombreDispositivo,
      creadaEn: ahora,
      ultimoUsoEn: null,
    };

    if (estado === null) {
      const codigo = await nuevoCodigoDeRecuperacion(deps);
      const gano = await deps.acceso.reclamar({
        webauthnUserId: desafio.valor.webauthnUserId ?? aleatorio(deps),
        ahora,
        origen: origen.valor,
        credencial,
        codigoRecuperacionHash: codigo.hash,
      });
      if (!gano) return fallo("TIENDA_YA_RECLAMADA", "Otra persona reclamó la tienda primero");
      const sesionNueva = await rotarACompleta(deps, e.sesion);
      return ok({ credencial, codigoDeRecuperacion: codigo.codigo, sesionNueva });
    }

    if (e.sesion.tipo === "recuperacion") {
      // Antes del batch, para no gastar el código en una credencial repetida (en carrera, el batch falla entero).
      if ((await deps.credenciales.buscarPorId(credencial.id)) !== null) return yaRegistrada();
      // Recién acá se gasta el código: credencial, código nuevo y fin de las sesiones de recuperación, juntos.
      const codigo = await nuevoCodigoDeRecuperacion(deps);
      const usado = await deps.acceso.completarRecuperacion({
        sesionIdHash: e.sesion.idHash,
        credencial,
        codigoRecuperacionHash: codigo.hash,
        ahora,
      });
      if (!usado) return fallo("CODIGO_INVALIDO", "Ese código de recuperación ya se usó.");
      const sesionNueva = await rotarACompleta(deps, e.sesion);
      return ok({ credencial, codigoDeRecuperacion: codigo.codigo, sesionNueva });
    }
    if (!(await deps.credenciales.guardar(credencial))) return yaRegistrada();
    return ok({ credencial, codigoDeRecuperacion: null, sesionNueva: null });
  };

export const iniciarIngreso =
  (deps: DepsAcceso) =>
  async (e: { origen: string; ip: string }): Promise<Result<OpcionesParaElNavegador, ErrorDeDominio>> => {
    const estado = await deps.acceso.obtener();
    if (estado === null) return fallo("ORIGEN_NO_PERMITIDO", "La tienda todavía no tiene dueño");
    const origen = await origenPara(deps, e.origen, estado);
    if (!origen.ok) return origen;
    // Cada pedido cuenta (no solo los fallidos): es lo que acota las escrituras sin sesión en D1.
    const clave = `ingreso:${e.ip}`;
    const limite = await bloqueado(deps, clave, MAXIMO_DE_PEDIDOS_DE_INGRESO);
    if (limite) return limite;
    await deps.limitador.registrarFallo(clave, deps.reloj.ahora());
    const { opciones, desafio } = await deps.ceremonia.opcionesDeIngreso({ rpId: origen.valor.rpId });
    const desafioId = await guardarDesafio(deps, desafio, "ingreso", {
      sesionIdHash: null,
      webauthnUserId: null,
    });
    return ok({ opciones, desafioId });
  };

export const completarIngreso =
  (deps: DepsAcceso) =>
  async (e: {
    origen: string;
    desafioId: string | null | undefined;
    credencialId: string;
    respuesta: unknown;
  }): Promise<Result<SesionIniciada, ErrorDeDominio>> => {
    const desafio = await consumirDesafio(deps, e.desafioId, "ingreso", null);
    if (!desafio.ok) return desafio;
    const estado = await deps.acceso.obtener();
    if (estado === null) return fallo("ORIGEN_NO_PERMITIDO", "La tienda todavía no tiene dueño");
    const origen = await origenPara(deps, e.origen, estado);
    if (!origen.ok) return origen;
    const credencial = await deps.credenciales.buscarPorId(e.credencialId);
    if (credencial === null || credencial.rpId !== origen.valor.rpId) {
      return fallo("PASSKEY_DESCONOCIDA", "No reconocemos esa passkey en esta tienda");
    }
    const verificada = await deps.ceremonia.verificarIngreso({
      respuesta: e.respuesta,
      desafio: desafio.valor.desafio,
      origen: origen.valor.origen,
      rpId: origen.valor.rpId,
      credencial,
    });
    if (!verificada.ok) return verificada;
    await deps.credenciales.actualizarUso(credencial.id, verificada.valor.nuevoContador, deps.reloj.ahora());
    return ok(await crearSesion(deps, "completa"));
  };

export const ingresarConCodigoDeRecuperacion =
  (deps: DepsAcceso) =>
  async (e: { codigo: string; ip: string }): Promise<Result<SesionIniciada, ErrorDeDominio>> => {
    const clave = `recuperacion:${e.ip}`;
    const limite = await bloqueado(deps, clave);
    if (limite) return limite;
    // Validar, borrar las demás sesiones y crear la de recuperación es atómico en el repositorio (la
    // comparación la hace la base sobre el hash). El código no se gasta hasta registrar la passkey nueva.
    const hash = await deps.cripto.sha256Hex(normalizarCodigo(e.codigo));
    const token = aleatorio(deps);
    const sesion = nuevaSesion(await deps.cripto.sha256Hex(token), "recuperacion", deps.reloj.ahora());
    if (!(await deps.acceso.iniciarRecuperacion(hash, sesion))) {
      await deps.limitador.registrarFallo(clave, deps.reloj.ahora());
      return codigoInvalido();
    }
    return ok({ token, sesion });
  };

export const regenerarCodigoDeRecuperacion = (deps: DepsAcceso) => async (): Promise<string> => {
  const codigo = await nuevoCodigoDeRecuperacion(deps);
  await deps.acceso.reemplazarCodigoDeRecuperacion(codigo.hash, deps.reloj.ahora());
  return codigo.codigo;
};

export type SesionValida = { sesion: Sesion; renovada: boolean };

export const validarSesion =
  (deps: DepsAcceso) =>
  async (token: string | null | undefined): Promise<Result<SesionValida, ErrorDeDominio>> => {
    const noAutenticado = fallo<SesionValida>("NO_AUTENTICADO", "Tenés que entrar a tu tienda");
    if (!token) return noAutenticado;
    const sesion = await deps.sesiones.buscar(await deps.cripto.sha256Hex(token));
    if (sesion === null) return noAutenticado;
    const ahora = deps.reloj.ahora();
    // Sin fila de acceso (plan de emergencia) solo sobrevive la sesión de un reclamo en curso.
    if (
      !sesionVigente(sesion, ahora) ||
      (sesion.tipo !== "reclamo" && (await deps.acceso.obtener()) === null)
    ) {
      await deps.sesiones.borrar(sesion.idHash);
      return noAutenticado;
    }
    if (!debeRenovar(sesion, ahora)) return ok({ sesion, renovada: false });
    const expiraEn = new Date(ahora.getTime() + DURACION_SESION[sesion.tipo]);
    await deps.sesiones.renovar(sesion.idHash, expiraEn, ahora);
    return ok({ sesion: { ...sesion, expiraEn, ultimoUsoEn: ahora }, renovada: true });
  };

export const cerrarSesion =
  (deps: DepsAcceso) =>
  (idHash: string): Promise<void> =>
    deps.sesiones.borrar(idHash);

export const listarPasskeys = (deps: DepsAcceso) => (): Promise<Credencial[]> => deps.credenciales.listar();

export const borrarPasskey =
  (deps: DepsAcceso) =>
  async (id: string): Promise<Result<true, ErrorDeDominio>> => {
    if ((await deps.credenciales.buscarPorId(id)) === null) return ok(true);
    if (!(await deps.credenciales.borrarSiNoEsLaUltima(id))) {
      return fallo("ULTIMA_PASSKEY", "No podés borrar tu única passkey: agregá otra primero");
    }
    return ok(true);
  };
