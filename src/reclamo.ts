import { hashDelCodigoDeReclamo } from "virtual:tiendita/reclamo";

/**
 * SHA-256 del código de reclamo del último build (integraciones/codigo-de-reclamo.mjs). Solo lo importa
 * código del servidor: el plugin hace fallar el build si un script del cliente lo pidiera.
 */
export const hashDelCodigo = (): string | null => hashDelCodigoDeReclamo || null;
