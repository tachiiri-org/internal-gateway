import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env, JwtPayload } from "../../types";
import { GatewayError } from "../../errors/gatewayError";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(url: string) {
  const existing = jwksCache.get(url);
  if (existing) return existing;
  const jwks = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, jwks);
  return jwks;
}

export async function verifyJwt(token: string, env: Env): Promise<JwtPayload> {
  const issuer = env.AUTH0_ISSUER;
  const audience = env.AUTH0_AUDIENCE;
  if (!issuer || !audience) {
    throw new GatewayError(500, "misconfigured", "Auth configuration missing");
  }

  const jwksUrl = env.AUTH0_JWKS_URL ?? new URL("/.well-known/jwks.json", issuer).toString();
  try {
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
      issuer,
      audience,
    });
    return payload;
  } catch {
    throw new GatewayError(401, "unauthorized", "Invalid token");
  }
}
