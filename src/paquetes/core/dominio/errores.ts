export type CodigoError =
  | "PRECIO_INVALIDO"
  | "SIN_IMAGEN"
  | "NOMBRE_VACIO"
  | "SLUG_INVALIDO"
  | "IMAGEN_INVALIDA"
  | "PRODUCTO_PAUSADO"
  | "PRODUCTO_NO_ENCONTRADO"
  | "CATEGORIA_NO_ENCONTRADA"
  | "CATEGORIA_CON_PRODUCTOS"
  | "ESTADO_INVALIDO"
  | "CODIGO_INVALIDO"
  | "TIENDA_YA_RECLAMADA"
  | "DESAFIO_VENCIDO"
  | "PASSKEY_NO_VERIFICADA"
  | "PASSKEY_DESCONOCIDA"
  | "PASSKEY_YA_REGISTRADA"
  | "ORIGEN_NO_PERMITIDO"
  | "NO_AUTENTICADO"
  | "ACCESO_LIMITADO"
  | "DEMASIADOS_INTENTOS"
  | "ULTIMA_PASSKEY"
  | "WHATSAPP_INVALIDO"
  | "TRANSFERENCIA_INVALIDA"
  | "PASO_INVALIDO"
  | "IDIOMA_INVALIDO"
  | "GITHUB_SIN_CONECTAR"
  | "GITHUB_NO_RESPONDE"
  | "GITHUB_VARIOS_REPOSITORIOS"
  | "YA_ACTUALIZADA";

export type ErrorDeDominio = {
  readonly codigo: CodigoError;
  readonly mensaje: string;
  readonly detalle?: Record<string, unknown>;
};

export function errorDeDominio(
  codigo: CodigoError,
  mensaje: string,
  detalle?: Record<string, unknown>,
): ErrorDeDominio {
  return detalle === undefined ? { codigo, mensaje } : { codigo, mensaje, detalle };
}
