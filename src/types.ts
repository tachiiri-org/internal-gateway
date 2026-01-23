import type { JWTPayload } from "jose";

export type RouteClass = "read" | "write" | "heavy";

export type AuthPolicy = "none" | "required";

export interface RouteDef {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS" | "ALL";
  path: string;
  upstreamPath: string;
  auth: AuthPolicy;
  class: RouteClass;
}

export interface Actor {
  kind: "user" | "service";
  sub: string;
  scopes: string[];
  tenant?: string;
  raw?: {
    iss: string;
    aud?: string | string[];
  };
}

export interface Env {
  BACKEND: Fetcher;
  PAGES_TO_GATEWAY_TOKEN: string;
  GATEWAY_TO_BACKEND_TOKEN: string;
  AUTH0_ISSUER: string;
  AUTH0_AUDIENCE: string;
  AUTH0_JWKS_URL?: string;
}

export type JwtClaims = JWTPayload;
