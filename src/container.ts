import {
  aplicarActualizacion,
  avanzarPrimerIngreso,
  borrarPasskey,
  cambiarIdiomaDeLaTienda,
  cerrarSesion,
  completarIngreso,
  completarRegistroDePasskey,
  conectarGithub,
  crearProducto,
  type DepsAcceso,
  type DepsActualizaciones,
  type DepsPrimerIngreso,
  estadoDeActualizacion,
  guardarNombreDeLaTienda,
  guardarTransferencia,
  guardarWhatsapp,
  ingresarConCodigoDeRecuperacion,
  iniciarIngreso,
  iniciarRegistroDePasskey,
  listarPasskeys,
  listarProductosPublicados,
  listarTodosLosProductos,
  obtenerEstadoDeLaTienda,
  obtenerProducto,
  prepararActualizacion,
  regenerarCodigoDeRecuperacion,
  registrarInstalacion,
  validarCodigoDeReclamo,
  validarSesion,
} from "./paquetes/core/index";
import {
  crearAlmacenImagenesR2,
  crearClienteGithub,
  crearLimitadorDeIntentosD1,
  crearRepositorioAccesoD1,
  crearRepositorioCategoriasD1,
  crearRepositorioConexionGithubD1,
  crearRepositorioCredencialesD1,
  crearRepositorioDesafiosD1,
  crearRepositorioMediosDePagoD1,
  crearRepositorioProductosD1,
  crearRepositorioSesionesD1,
  crearRepositorioTiendaD1,
  criptografiaWebCrypto,
  generadorUlid,
  relojSistema,
} from "./paquetes/infra-cloudflare/index";
import { crearCeremoniaSimpleWebAuthn } from "./adaptadores/ceremonia-simplewebauthn";
import { hashDelCodigo } from "./reclamo";

/** Composition root: arma los casos de uso por request con los adaptadores de `env`. */
export function armar(env: Env) {
  const repo = crearRepositorioProductosD1(env.DB);
  const categorias = crearRepositorioCategoriasD1(env.DB);
  const imagenes = crearAlmacenImagenesR2(env.IMAGENES, generadorUlid);
  const tienda = crearRepositorioTiendaD1(env.DB);
  const accesoRepo = crearRepositorioAccesoD1(env.DB);
  const deps: DepsAcceso = {
    acceso: accesoRepo,
    credenciales: crearRepositorioCredencialesD1(env.DB),
    sesiones: crearRepositorioSesionesD1(env.DB),
    desafios: crearRepositorioDesafiosD1(env.DB),
    limitador: crearLimitadorDeIntentosD1(env.DB),
    ceremonia: crearCeremoniaSimpleWebAuthn(),
    cripto: criptografiaWebCrypto,
    reloj: relojSistema,
    tienda,
    hashDelCodigoDeReclamo: hashDelCodigo,
  };
  const depsPrimerIngreso: DepsPrimerIngreso = {
    acceso: accesoRepo,
    tienda,
    medios: crearRepositorioMediosDePagoD1(env.DB),
    reloj: relojSistema,
    ids: generadorUlid,
  };
  const depsActualizaciones: DepsActualizaciones = {
    conexion: crearRepositorioConexionGithubD1(env.DB),
    github: crearClienteGithub(),
    reloj: relojSistema,
  };
  return {
    estadoDeLaTienda: obtenerEstadoDeLaTienda({ acceso: accesoRepo }),
    origenesPermitidos: async () => (await accesoRepo.origenesPermitidos()).map((o) => o.origen),
    obtenerTienda: () => tienda.obtener(),
    obtenerMedioDePago: depsPrimerIngreso.medios.obtener.bind(depsPrimerIngreso.medios),
    listarProductos: listarProductosPublicados({ repo }),
    listarTodosLosProductos: listarTodosLosProductos({ repo }),
    obtenerProducto: obtenerProducto({ repo }),
    crearProducto: crearProducto({ repo, categorias, imagenes, reloj: relojSistema, ids: generadorUlid }),
    acceso: {
      validarCodigoDeReclamo: validarCodigoDeReclamo(deps),
      iniciarRegistroDePasskey: iniciarRegistroDePasskey(deps),
      completarRegistroDePasskey: completarRegistroDePasskey(deps),
      iniciarIngreso: iniciarIngreso(deps),
      completarIngreso: completarIngreso(deps),
      ingresarConCodigoDeRecuperacion: ingresarConCodigoDeRecuperacion(deps),
      regenerarCodigoDeRecuperacion: regenerarCodigoDeRecuperacion(deps),
      validarSesion: validarSesion(deps),
      cerrarSesion: cerrarSesion(deps),
      listarPasskeys: listarPasskeys(deps),
      borrarPasskey: borrarPasskey(deps),
    },
    primerIngreso: {
      guardarNombreDeLaTienda: guardarNombreDeLaTienda(depsPrimerIngreso),
      cambiarIdioma: cambiarIdiomaDeLaTienda(depsPrimerIngreso),
      guardarWhatsapp: guardarWhatsapp(depsPrimerIngreso),
      guardarTransferencia: guardarTransferencia(depsPrimerIngreso),
      avanzar: avanzarPrimerIngreso(depsPrimerIngreso),
    },
    actualizaciones: {
      obtenerConexion: () => depsActualizaciones.conexion.obtener(),
      estado: estadoDeActualizacion(depsActualizaciones),
      conectar: conectarGithub(depsActualizaciones),
      registrarInstalacion: registrarInstalacion(depsActualizaciones),
      preparar: prepararActualizacion(depsActualizaciones),
      aplicar: aplicarActualizacion(depsActualizaciones),
    },
    imagenes,
    bucket: env.IMAGENES,
  };
}

export type Contenedor = ReturnType<typeof armar>;
