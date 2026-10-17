import type { SettingKey } from "../domain/settings";

export interface SettingsRepository {
  get(key: SettingKey): Promise<string | null>;
  /** Inserts or replaces the value; `now` is when it was written. */
  set(key: SettingKey, value: string, now: Date): Promise<void>;
}
