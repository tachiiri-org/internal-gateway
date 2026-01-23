import { errorResponse } from "./errors/gatewayError";
import { getRequestId } from "./logging/requestId";
import { actorFromJwt } from "./policies/auth/actor";
import { getBearerToken } from "./policies/auth/bearer";
import { verifyJwt } from "./policies/auth/verifyJwt";
import { assertInternalToken } from "./policies/internal/requireInternalToken";
import { rateLimitKey } from "./policies/rateLimit/key";
import { enforceRateLimit } from "./policies/rateLimit/limiter";
import { matchV1Route } from "./routes/v1/routes";
import { proxyToBackend } from "./upstreams/backend";
import type { Actor, Env } from "./types";
import { GatewayError, jsonResponse } from "./errors/gatewayError";

export async function handleRequest(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return jsonResponse({ status: "ok" }, 200, requestId);
  }

  const route = matchV1Route(url.pathname);
  if (!route) {
    throw new GatewayError(404, "not_found", "Not Found");
  }

  assertInternalToken(request, env);

  const token = getBearerToken(request);
  if (!token) {
    throw new GatewayError(401, "unauthorized", "Missing bearer token");
  }

  const payload = await verifyJwt(token, env);
  const actor: Actor = actorFromJwt(payload);

  const key = rateLimitKey(actor, request);
  enforceRateLimit(key, route.rateClass);

  return proxyToBackend({
    request,
    env,
    upstreamPath: route.upstreamPath + url.search,
    actor,
    requestId,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = getRequestId(request);
    try {
      return await handleRequest(request, env, requestId);
    } catch (error) {
      return errorResponse(error, requestId);
    }
  },
};
