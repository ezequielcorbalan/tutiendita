import { type Dinero, multiplicar, sumar } from "./dinero";
import { type ErrorDeDominio, errorDeDominio } from "./errores";
import { err, ok, type Result } from "./result";

export type EstadoPedido = "nuevo" | "contactado" | "pagado" | "entregado" | "cancelado";

export type ItemPedido = {
  readonly productoId: string;
  readonly nombre: string;
  /** Precio congelado al momento de pedir. */
  readonly precioUnitario: Dinero;
  readonly cantidad: number;
};

/** Intención de compra confirmada. No es un pago: el dinero nunca pasa por el sistema. */
export type Pedido = {
  readonly id: string;
  readonly items: readonly ItemPedido[];
  readonly comprador: {
    readonly nombre: string;
    readonly telefono: string;
    readonly email: string | null;
  };
  readonly medioDePago: string;
  readonly estado: EstadoPedido;
  readonly nota: string;
  readonly creadoPorAgente: boolean;
  readonly creadoEn: Date;
};

/** El total se calcula siempre en el servidor; nunca se confía en el navegador. */
export function calcularTotal(items: readonly ItemPedido[]): Result<Dinero, ErrorDeDominio> {
  const primero = items[0];
  if (primero === undefined) {
    return err(errorDeDominio("PRECIO_INVALIDO", "Un pedido necesita al menos un ítem"));
  }
  let total: Dinero = { monto: 0, moneda: primero.precioUnitario.moneda };
  for (const item of items) {
    if (!Number.isInteger(item.cantidad) || item.cantidad <= 0) {
      return err(
        errorDeDominio("PRECIO_INVALIDO", "La cantidad debe ser un entero mayor a cero", {
          productoId: item.productoId,
          cantidad: item.cantidad,
        }),
      );
    }
    if (item.precioUnitario.moneda !== total.moneda) {
      return err(
        errorDeDominio("PRECIO_INVALIDO", "Todos los ítems deben estar en la misma moneda", {
          esperada: total.moneda,
          recibida: item.precioUnitario.moneda,
        }),
      );
    }
    total = sumar(total, multiplicar(item.precioUnitario, item.cantidad));
  }
  return ok(total);
}

export const transiciones: Readonly<Record<EstadoPedido, readonly EstadoPedido[]>> = {
  nuevo: ["contactado", "pagado", "cancelado"],
  contactado: ["pagado", "cancelado"],
  pagado: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

export const puedeTransicionar = (de: EstadoPedido, a: EstadoPedido): boolean => transiciones[de].includes(a);
