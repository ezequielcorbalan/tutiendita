/** Señal de interés real sobre un producto. Única materia prima del ranking de libremercado. */
export type TipoEvento = "vista" | "clic_contacto" | "pedido_creado";

export type EventoDeEngagement = {
  readonly tipo: TipoEvento;
  readonly productoId: string;
  readonly momento: Date;
  readonly origen: "web" | "agente";
};
