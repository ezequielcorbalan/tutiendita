import type { ConfiguredPaymentMethod, PaymentMethodType } from "../domain/payment-method";

export interface PaymentMethodRepository {
  get<T extends PaymentMethodType>(type: T): Promise<Extract<ConfiguredPaymentMethod, { type: T }> | null>;
  save(m: ConfiguredPaymentMethod): Promise<void>;
}
