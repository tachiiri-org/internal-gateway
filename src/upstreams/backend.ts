import type { Actor, Env } from "../types";
import { sanitizeActorHeaders } from "../policies/internal/sanitizeActorHeaders";

export async function proxyToBackend(params: {
  request: Request;
  env: Env;
  upstreamPath: string;
  actor: Actor;
  requestId: string;
}): Promise<Response> {
  const { request, env, upstreamPath, actor, requestId } = params;
  const targetUrl = new URL(upstreamPath, "https://backend.internal");
  const headers = new Headers(request.headers);

  sanitizeActorHeaders(headers);
  headers.delete("authorization");
  headers.delete("x-internal-token");

  headers.set("x-actor-sub", actor.sub);
  headers.set("x-actor-scopes", actor.scopes.join(" "));
  if (actor.tenant) {
    headers.set("x-actor-tenant", actor.tenant);
  }
  headers.set("x-gateway-token", env.GATEWAY_TO_BACKEND_TOKEN);
  headers.set("x-request-id", requestId);

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

  const response = await env.BACKEND.fetch(upstreamRequest);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("x-request-id", requestId);

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
