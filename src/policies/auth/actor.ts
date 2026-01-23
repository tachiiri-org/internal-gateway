import type { JwtPayload } from "../../types";
import type { Actor } from "../../types";
import { GatewayError } from "../../errors/gatewayError";

export function actorFromJwt(payload: JwtPayload): Actor {
  if (!payload.sub) {
    throw new GatewayError(401, "unauthorized", "Missing subject claim");
  }

  const scopes = normalizeScopes(payload);
  const tenant = normalizeTenant(payload);

  return {
    kind: "user",
    sub: payload.sub,
    scopes,
    tenant,
  };
}

function normalizeScopes(payload: JwtPayload): string[] {
  const scopeValue = payload.scope ?? payload.scopes;
  if (!scopeValue) return [];
  if (typeof scopeValue === "string") {
    return scopeValue.split(" ").filter(Boolean);
  }
  if (Array.isArray(scopeValue)) {
    return scopeValue.map((value) => String(value));
  }
  return [String(scopeValue)];
}

function normalizeTenant(payload: JwtPayload): string | undefined {
  const tenant = payload.tenant ?? payload["https://tachiiri.example/tenant"];
  if (!tenant) return undefined;
  return String(tenant);
}
