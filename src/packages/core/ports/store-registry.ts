/** The registry of active stores at tutiendita.ar. Only the store's origin ever travels. */
export interface StoreRegistry {
  /** Announces that the store at `origin` is alive; rejects if the registry does not accept it. */
  announce(origin: string): Promise<void>;
}
