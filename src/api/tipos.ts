import type { Sesion } from "../paquetes/core/index";

/** Entorno de Hono: bindings del Worker y la sesión que carga `cargarSesion`. */
export type EntornoApi = {
  Bindings: Env;
  Variables: {
    sesion: Sesion | null;
    /** El token en claro de la cookie (solo para renovarla). */
    tokenDeSesion: string | null;
  };
};
