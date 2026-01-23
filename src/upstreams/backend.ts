import type { Actor, Env, RouteDef } from "../types";
import { sanitizeActorHeaders } from "../policies/internal/sanitizeActorHeaders";
import { actorToHeaders } from "../policies/auth/actor";
import { GatewayError } from "../errors/gatewayError";

export async function proxyToBackend(params: {
  request: Request;
  env: Env;
  upstreamPath: string;
  actor: Actor | null;
  requestId: string;
  routeDef: RouteDef;
}): Promise<Response> {
  const { request, env, upstreamPath, actor, requestId, routeDef } = params;
  const targetUrl = new URL(upstreamPath, "https://backend.internal");
  const headers = new Headers(request.headers);

  sanitizeActorHeaders(headers);
  // authorization はバックエンドで必要（Google Drive等のサービス認証用）
  headers.delete("x-internal-token");

  if (actor) {
    const actorHeaders = actorToHeaders(actor);
    actorHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }
  headers.set("x-gateway-token", env.GATEWAY_TO_BACKEND_TOKEN);
  headers.set("x-request-id", requestId);
  headers.set("x-route-id", routeDef.id);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
  };

  if (request.body) {
    init.duplex = "half";
  }

  const upstreamRequest = new Request(targetUrl.toString(), init);

  let response: Response;
  try {
    response = await env.BACKEND.fetch(upstreamRequest);
  } catch (error) {
    throw new GatewayError({
      status: 502,
      code: "upstream_unreachable",
      message: "Upstream unavailable",
      cause: error,
    });
  }

  if (!response.ok) {
    const upstreamBody = await readUpstreamBody(response);
    throw new GatewayError({
      status: response.status,
      code: "upstream_error",
      message: "Upstream request failed",
      cause: upstreamBody,
    });
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("x-request-id", requestId);

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

async function readUpstreamBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      return await response.json();
    }
    return await response.text();
  } catch (error) {
    return { error: "failed_to_read_body", cause: error };
  }
}
