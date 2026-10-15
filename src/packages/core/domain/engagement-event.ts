/** Signal of real interest in a product. The only raw material of the libremercado ranking. */
// Stored literals: values stay in Spanish (view, contact click, order created; origin web | agent).
export type EventType = "vista" | "clic_contacto" | "pedido_creado";

export type EngagementEvent = {
  readonly type: EventType;
  readonly productId: string;
  readonly occurredAt: Date;
  readonly origin: "web" | "agente";
};
