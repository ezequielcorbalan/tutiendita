import { type ErrorDeDominio, errorDeDominio } from "./errores";
import { err, ok, type Result } from "./result";

/** El comercio dueño de un despliegue. Hay exactamente una por despliegue. */
export type Tienda = {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly logoKey: string | null;
  readonly moneda: string;
  /** En qué idioma se muestran la tienda y su panel. */
  readonly idioma: Idioma;
  readonly contacto: {
    readonly whatsapp: string | null;
    readonly email: string | null;
  };
  readonly dominio: string | null;
};

export const IDIOMAS = ["es", "en", "pt"] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_POR_DEFECTO: Idioma = "es";

export const LARGO_MAXIMO_NOMBRE_TIENDA = 80;
/** El primer ingreso no pregunta la moneda: se cambia después desde el panel. */
export const MONEDA_POR_DEFECTO = "ARS";

function validarNombre(nombre: string): Result<string, ErrorDeDominio> {
  const limpio = nombre.trim();
  if (limpio === "" || limpio.length > LARGO_MAXIMO_NOMBRE_TIENDA) {
    return err(
      errorDeDominio(
        "NOMBRE_VACIO",
        `El nombre de la tienda va de 1 a ${LARGO_MAXIMO_NOMBRE_TIENDA} caracteres`,
        {
          maximo: LARGO_MAXIMO_NOMBRE_TIENDA,
        },
      ),
    );
  }
  return ok(limpio);
}

export function validarIdioma(idioma: string): Result<Idioma, ErrorDeDominio> {
  return (IDIOMAS as readonly string[]).includes(idioma)
    ? ok(idioma as Idioma)
    : err(errorDeDominio("IDIOMA_INVALIDO", "Elegí español, inglés o portugués", { permitidos: IDIOMAS }));
}

export function crearTienda(
  e: { nombre: string; idioma?: string },
  ctx: { id: string },
): Result<Tienda, ErrorDeDominio> {
  const nombre = validarNombre(e.nombre);
  if (!nombre.ok) return nombre;
  const idioma = validarIdioma(e.idioma ?? IDIOMA_POR_DEFECTO);
  if (!idioma.ok) return idioma;
  return ok({
    id: ctx.id,
    nombre: nombre.valor,
    descripcion: "",
    logoKey: null,
    moneda: MONEDA_POR_DEFECTO,
    idioma: idioma.valor,
    contacto: { whatsapp: null, email: null },
    dominio: null,
  });
}

export function renombrar(t: Tienda, nombre: string): Result<Tienda, ErrorDeDominio> {
  const limpio = validarNombre(nombre);
  return limpio.ok ? ok({ ...t, nombre: limpio.valor }) : limpio;
}

export function conIdioma(t: Tienda, idioma: string): Result<Tienda, ErrorDeDominio> {
  const valido = validarIdioma(idioma);
  return valido.ok ? ok({ ...t, idioma: valido.valor }) : valido;
}

export const conWhatsapp = (t: Tienda, numero: string): Tienda => ({
  ...t,
  contacto: { ...t.contacto, whatsapp: numero },
});
