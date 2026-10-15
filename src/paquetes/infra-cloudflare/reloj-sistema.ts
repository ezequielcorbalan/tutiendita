import type { Reloj } from "../core/index";

export const relojSistema: Reloj = {
  ahora: () => new Date(),
};
