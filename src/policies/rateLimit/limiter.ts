import type { RouteClass } from "../../types";
import { GatewayError } from "../../errors/gatewayError";

interface RateLimitState {
  resetAt: number;
  count: number;
}

const WINDOW_MS = 60_000;

const RATE_LIMITS: Record<RouteClass, number> = {
  read: 120,
  write: 60,
  heavy: 10,
};

const store = new Map<string, RateLimitState>();

export function enforceRateLimit(key: string, rateClass: RouteClass): void {
  const now = Date.now();
  const limit = RATE_LIMITS[rateClass];
  const compositeKey = `${rateClass}:${key}`;
  const existing = store.get(compositeKey);

  if (!existing || now >= existing.resetAt) {
    store.set(compositeKey, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  if (existing.count >= limit) {
    throw new GatewayError({
      status: 429,
      code: "rate_limited",
      message: "Too many requests",
    });
  }

  existing.count += 1;
}
