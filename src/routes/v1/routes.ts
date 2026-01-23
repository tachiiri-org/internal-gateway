import type { Actor, Env, RouteDef } from "../../types";
import { GatewayError } from "../../errors/gatewayError";
import { getBearerToken } from "../../policies/auth/bearer";
import { actorFromJwt } from "../../policies/auth/actor";
import { verifyJwt } from "../../policies/auth/verifyJwt";
import { assertInternalToken } from "../../policies/internal/requireInternalToken";
import { rateLimitKey } from "../../policies/rateLimit/key";
import { enforceRateLimit } from "../../policies/rateLimit/limiter";
import { proxyToBackend } from "../../upstreams/backend";

export const routes: RouteDef[] = [
  {
    id: "rpc-read",
    method: "GET",
    path: "/api/v1",
    upstreamPath: "/rpc",
    auth: "required",
    class: "read",
  },
  {
    id: "rpc-write-post",
    method: "POST",
    path: "/api/v1",
    upstreamPath: "/rpc",
    auth: "required",
    class: "write",
  },
  {
    id: "rpc-write-put",
    method: "PUT",
    path: "/api/v1",
    upstreamPath: "/rpc",
    auth: "required",
    class: "write",
  },
  {
    id: "rpc-write-patch",
    method: "PATCH",
    path: "/api/v1",
    upstreamPath: "/rpc",
    auth: "required",
    class: "write",
  },
  {
    id: "rpc-write-delete",
    method: "DELETE",
    path: "/api/v1",
    upstreamPath: "/rpc",
    auth: "required",
    class: "write",
  },
  {
    id: "rpc-options",
    method: "OPTIONS",
    path: "/api/v1",
    upstreamPath: "/rpc",
    auth: "none",
    class: "read",
  },
];

export async function handleV1Request(params: {
  request: Request;
  env: Env;
  requestId: string;
}): Promise<Response> {
  const { request, env, requestId } = params;
  const url = new URL(request.url);
  const match = matchV1Route(request.method, url.pathname);
  if (!match) {
    throw new GatewayError({ status: 404, code: "not_found", message: "Not Found" });
  }

  assertInternalToken(request, env);

  let actor: Actor | null = null;
  if (match.route.auth === "required") {
    const token = getBearerToken(request);
    if (!token) {
      throw new GatewayError({
        status: 401,
        code: "unauthorized",
        message: "Missing bearer token",
      });
    }

    const payload = await verifyJwt(token, env);
    actor = actorFromJwt(payload);
  }

  const key = rateLimitKey(actor, request);
  enforceRateLimit(key, match.route.class);

  return proxyToBackend({
    request,
    env,
    upstreamPath: match.upstreamPath + url.search,
    actor,
    requestId,
    routeDef: match.route,
  });
}

export function matchV1Route(
  method: string,
  pathname: string,
): { route: RouteDef; upstreamPath: string } | null {
  for (const route of routes) {
    if (route.method !== "ALL" && route.method !== method) {
      continue;
    }
    if (pathname === route.path || pathname.startsWith(`${route.path}/`)) {
      const suffix = pathname.slice(route.path.length);
      return {
        route,
        upstreamPath: `${route.upstreamPath}${suffix}`,
      };
    }
  }
  return null;
}
