import type { Actor } from "../../types";

export function rateLimitKey(actor: Actor | null, request: Request): string {
  if (actor?.sub) return actor.sub;
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  return ip ?? "unknown";
}
