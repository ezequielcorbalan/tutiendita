import {
  ARCHIVOS_QUE_SE_CONSERVAN,
  type ConexionLista,
  type EstadoDeActualizacion,
  esMasNueva,
  estaLista,
  REPO_OFICIAL,
} from "../dominio/actualizacion";
import { type ErrorDeDominio, errorDeDominio } from "../dominio/errores";
import { err, ok, type Result } from "../dominio/result";
import type { ClienteGithub, RepositorioConexionGithub } from "../puertos/github";
import type { Reloj } from "../puertos/reloj";

export type DepsActualizaciones = {
  readonly conexion: RepositorioConexionGithub;
  readonly github: ClienteGithub;
  readonly reloj: Reloj;
};

const sinConectar = () =>
  err(errorDeDominio("GITHUB_SIN_CONECTAR", "Primero conectá la tienda con su repositorio de GitHub"));

/** Toda llamada a GitHub puede fallar por red, permisos o límites: el panel muestra el aviso, no un error 500. */
async function conGithub<T>(f: () => Promise<T>): Promise<Result<T, ErrorDeDominio>> {
  try {
    return ok(await f());
  } catch (causa) {
    return err(
      errorDeDominio(
        "GITHUB_NO_RESPONDE",
        "GitHub no respondió como esperábamos; probá de nuevo en un rato",
        {
          causa: String(causa),
        },
      ),
    );
  }
}

async function conexionLista(deps: DepsActualizaciones): Promise<ConexionLista | null> {
  const c = await deps.conexion.obtener();
  return c && estaLista(c) ? c : null;
}

export const estadoDeActualizacion =
  (deps: DepsActualizaciones) =>
  async (actual: string): Promise<Result<EstadoDeActualizacion, ErrorDeDominio>> => {
    const c = await deps.conexion.obtener();
    if (c === null) return ok({ estado: "sin-conectar" });
    if (!estaLista(c)) return ok({ estado: "sin-instalar", slug: c.slug });
    const nueva = await conGithub(() => deps.github.versionOficial(c, REPO_OFICIAL));
    if (!nueva.ok) return nueva;
    return ok(
      esMasNueva(nueva.valor, actual)
        ? { estado: "hay-nueva", actual, nueva: nueva.valor }
        : { estado: "al-dia", actual },
    );
  };

/** Paso 1: GitHub creó la app desde el manifiesto y devolvió un `code` de un solo uso. */
export const conectarGithub =
  (deps: DepsActualizaciones) =>
  async (codigo: string): Promise<Result<{ slug: string }, ErrorDeDominio>> => {
    const app = await conGithub(() => deps.github.canjearManifiesto(codigo));
    if (!app.ok) return app;
    await deps.conexion.guardar({ ...app.valor, instalacionId: null, repositorio: null }, deps.reloj.ahora());
    return ok({ slug: app.valor.slug });
  };

/** Paso 2: la app quedó instalada; tiene que ver un solo repo, el de la tienda. */
export const registrarInstalacion =
  (deps: DepsActualizaciones) =>
  async (instalacionId: number): Promise<Result<{ repositorio: string }, ErrorDeDominio>> => {
    const c = await deps.conexion.obtener();
    if (c === null) return sinConectar();
    const repos = await conGithub(() => deps.github.repositoriosDeLaInstalacion({ ...c, instalacionId }));
    if (!repos.ok) return repos;
    const [repositorio, ...otros] = repos.valor;
    if (repositorio === undefined || otros.length > 0) {
      return err(
        errorDeDominio(
          "GITHUB_VARIOS_REPOSITORIOS",
          "Dale acceso a la app solo al repositorio de tu tienda",
          {
            repositorios: repos.valor,
          },
        ),
      );
    }
    await deps.conexion.guardar({ ...c, instalacionId, repositorio }, deps.reloj.ahora());
    return ok({ repositorio });
  };

/** Abre el pull request con la versión nueva. La persona lo revisa y decide si lo aplica. */
export const prepararActualizacion =
  (deps: DepsActualizaciones) =>
  async (
    actual: string,
  ): Promise<Result<{ numero: number; url: string; archivos: number; version: string }, ErrorDeDominio>> => {
    const c = await conexionLista(deps);
    if (c === null) return sinConectar();
    const version = await conGithub(() => deps.github.versionOficial(c, REPO_OFICIAL));
    if (!version.ok) return version;
    const yaEsta = () => err(errorDeDominio("YA_ACTUALIZADA", "Tu tienda ya tiene la última versión"));
    if (!esMasNueva(version.valor, actual)) return yaEsta();
    const pr = await conGithub(() =>
      deps.github.prepararActualizacion(c, {
        repoOficial: REPO_OFICIAL,
        version: version.valor,
        conservar: ARCHIVOS_QUE_SE_CONSERVAN,
      }),
    );
    if (!pr.ok) return pr;
    if (pr.valor === null) return yaEsta();
    return ok({ ...pr.valor, version: version.valor });
  };

/** Mergea el pull request; el push a la rama principal hace que Cloudflare redespliegue y migre. */
export const aplicarActualizacion =
  (deps: DepsActualizaciones) =>
  async (numero: number): Promise<Result<{ numero: number }, ErrorDeDominio>> => {
    const c = await conexionLista(deps);
    if (c === null) return sinConectar();
    const r = await conGithub(() => deps.github.aplicarActualizacion(c, numero));
    return r.ok ? ok({ numero }) : r;
  };
