import type { JWTPayload } from "jose";

export type RateLimitClass = "read" | "write" | "heavy";

export interface Actor {
  kind: "user";
  sub: string;
  scopes: string[];
  tenant?: string;
}

export interface Env {
  BACKEND_URL: string;
  PAGES_TO_GATEWAY_TOKEN: string;
  GATEWAY_TO_BACKEND_TOKEN: string;
  AUTH0_ISSUER: string;
  AUTH0_AUDIENCE: string;
  AUTH0_JWKS_URL?: string;
}

export type JwtPayload = JWTPayload;
