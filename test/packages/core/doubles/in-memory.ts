import type { Category } from "../../../../src/packages/core/domain/category";
import { isOpen, type Order, type OrderStatus } from "../../../../src/packages/core/domain/order";
import type { ConfiguredPaymentMethod, PaymentMethodType } from "../../../../src/packages/core/domain/payment-method";
import type { Product } from "../../../../src/packages/core/domain/product";
import type { SettingKey } from "../../../../src/packages/core/domain/settings";
import type { Store } from "../../../../src/packages/core/domain/store";
import type { CategoryRepository } from "../../../../src/packages/core/ports/category-repository";
import type { Clock } from "../../../../src/packages/core/ports/clock";
import type { IdGenerator } from "../../../../src/packages/core/ports/id-generator";
import type { AllowedMime, ImageStorage } from "../../../../src/packages/core/ports/image-storage";
import type { OrderRepository } from "../../../../src/packages/core/ports/order-repository";
import type { PaymentMethodRepository } from "../../../../src/packages/core/ports/payment-method-repository";
import type { ProductRepository } from "../../../../src/packages/core/ports/product-repository";
import type { SettingsRepository } from "../../../../src/packages/core/ports/settings-repository";
import type { StoreRepository } from "../../../../src/packages/core/ports/store-repository";

export class InMemoryProductRepository implements ProductRepository {
  readonly byId = new Map<string, Product>();

  async listPublished(): Promise<Product[]> {
    return [...this.byId.values()].filter((p) => p.status === "publicado");
  }
  async listAll(): Promise<Product[]> {
    return [...this.byId.values()];
  }
  async findBySlug(slug: string): Promise<Product | null> {
    return [...this.byId.values()].find((p) => p.slug === slug) ?? null;
  }
  async findById(id: string): Promise<Product | null> {
    return this.byId.get(id) ?? null;
  }
  async slugExists(slug: string): Promise<boolean> {
    return (await this.findBySlug(slug)) !== null;
  }
  async count(): Promise<number> {
    return this.byId.size;
  }
  async save(p: Product): Promise<void> {
    this.byId.set(p.id, p);
  }
  async remove(id: string): Promise<void> {
    this.byId.delete(id);
  }
}

export class InMemoryCategoryRepository implements CategoryRepository {
  readonly byId = new Map<string, Category>();

  async list(): Promise<Category[]> {
    return [...this.byId.values()];
  }
  async findById(id: string): Promise<Category | null> {
    return this.byId.get(id) ?? null;
  }
  async save(c: Category): Promise<void> {
    this.byId.set(c.id, c);
  }
  /** `products`: the product repo used to check usage (if not set, no category has products). */
  products: InMemoryProductRepository | null = null;
  async deleteIfUnused(id: string): Promise<boolean> {
    const used = [...(this.products?.byId.values() ?? [])].some((p) => p.categoryId === id);
    return !used && this.byId.delete(id);
  }
}

export class InMemoryStoreRepository implements StoreRepository {
  savedAt: Date | null = null;
  constructor(private store: Store | null = null) {}

  async get(): Promise<Store | null> {
    return this.store;
  }
  async save(t: Store, now: Date): Promise<void> {
    this.store = t;
    this.savedAt = now;
  }
  async markHeartbeat(sentAt: Date): Promise<void> {
    if (this.store) this.store = { ...this.store, heartbeatSentAt: sentAt.toISOString() };
  }
  async setHeartbeat(enabled: boolean, now: Date): Promise<void> {
    if (this.store) this.store = { ...this.store, heartbeatEnabled: enabled };
    this.savedAt = now;
  }
}

export class InMemoryPaymentMethodRepository implements PaymentMethodRepository {
  readonly byType = new Map<PaymentMethodType, ConfiguredPaymentMethod>();
  async get<T extends PaymentMethodType>(type: T) {
    return (this.byType.get(type) ?? null) as Extract<ConfiguredPaymentMethod, { type: T }> | null;
  }
  async save(m: ConfiguredPaymentMethod): Promise<void> {
    this.byType.set(m.type, m);
  }
}

export class InMemoryImageStorage implements ImageStorage {
  readonly files = new Map<string, { bytes: Uint8Array; mimeType: AllowedMime }>();
  private counter = 0;

  async save(bytes: Uint8Array, mimeType: string): Promise<{ key: string }> {
    this.counter += 1;
    const key = `img-${this.counter}`;
    this.files.set(key, { bytes, mimeType: mimeType as AllowedMime });
    return { key };
  }
  async read(key: string): Promise<{ bytes: Uint8Array; mimeType: AllowedMime } | null> {
    return this.files.get(key) ?? null;
  }
  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
  async count(): Promise<number> {
    return this.files.size;
  }
}

export class InMemorySettingsRepository implements SettingsRepository {
  private readonly values = new Map<SettingKey, string>();

  async get(key: SettingKey): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async set(key: SettingKey, value: string, _now: Date): Promise<void> {
    this.values.set(key, value);
  }
}

export class FixedClock implements Clock {
  constructor(private readonly date: Date) {}
  now(): Date {
    return this.date;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private n = 0;
  newId(): string {
    this.n += 1;
    return `id-${this.n}`;
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  readonly byId = new Map<string, Order>();

  async insert(o: Order): Promise<void> {
    this.byId.set(o.id, o);
  }
  async list(): Promise<Order[]> {
    return [...this.byId.values()].sort(
      (a, b) =>
        Number(isOpen(b.status)) - Number(isOpen(a.status)) || b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }
  async findById(id: string): Promise<Order | null> {
    return this.byId.get(id) ?? null;
  }
  async updateStatus(id: string, status: OrderStatus, updatedAt: Date): Promise<void> {
    const o = this.byId.get(id);
    if (o) this.byId.set(id, { ...o, status, updatedAt });
  }
}
