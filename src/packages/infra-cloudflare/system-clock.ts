import type { Clock } from "../core/index";

export const systemClock: Clock = {
  now: () => new Date(),
};
