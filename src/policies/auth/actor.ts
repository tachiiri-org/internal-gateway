import type { Actor, JwtClaims } from "../../types";
import { GatewayError } from "../../errors/gatewayError";

const ACTOR_SCOPE_SEPARATOR = " ";

export function actorFromJwt(payload: JwtClaims): Actor {
  if (!payload.sub) {
    throw new GatewayError({
      status: 401,
      code: "unauthorized",
      message: "Missing subject claim",
    });
  }

  const scopes = normalizeScopes(payload);
  const tenant = normalizeTenant(payload);
  const rawIssuer = payload.iss ? { iss: payload.iss, aud: payload.aud } : undefined;

  return {
    kind: "user",
    sub: payload.sub,
    scopes,
    tenant,
    raw: rawIssuer,
  };
}

export function actorToHeaders(actor: Actor): HeadersInit {
  const headers = new Headers();
  headers.set("x-actor-kind", actor.kind);
  headers.set("x-actor-sub", actor.sub);
  headers.set("x-actor-scopes", actor.scopes.join(ACTOR_SCOPE_SEPARATOR));
  if (actor.tenant) {
    headers.set("x-actor-tenant", actor.tenant);
  }
  return headers;
}

export function headersToActor(headers: Headers): Actor {
  const kindHeader = headers.get("x-actor-kind");
  const kind = kindHeader === "service" ? "service" : "user";
  const sub = headers.get("x-actor-sub") ?? "";
  const scopesHeader = headers.get("x-actor-scopes") ?? "";
  const scopes = scopesHeader.split(ACTOR_SCOPE_SEPARATOR).filter(Boolean);
  const tenant = headers.get("x-actor-tenant") ?? undefined;

  return {
    kind,
    sub,
    scopes,
    tenant,
  };
}

function normalizeScopes(payload: JwtClaims): string[] {
  const scopeValue = payload.scope ?? payload.scopes;
  if (!scopeValue) return [];
  if (typeof scopeValue === "string") {
    return scopeValue.split(ACTOR_SCOPE_SEPARATOR).filter(Boolean);
  }
  if (Array.isArray(scopeValue)) {
    return scopeValue.map((value) => String(value));
  }
  return [String(scopeValue)];
}

function normalizeTenant(payload: JwtClaims): string | undefined {
  const tenant = payload.tenant ?? payload["https://tachiiri.example/tenant"];
  if (!tenant) return undefined;
  return String(tenant);
}
