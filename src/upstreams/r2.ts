import createClient from "openapi-fetch";
import type { paths } from "../types/r2-api";
import type { Actor, Env, RouteDef } from "../types";
import { sanitizeActorHeaders } from "../policies/internal/sanitizeActorHeaders";
import { actorToHeaders } from "../policies/auth/actor";
import { GatewayError } from "../errors/gatewayError";

export type R2RpcPath = Extract<keyof paths, `/rpc/r2_${string}`>;

export function makeR2Client(params: {
  env: Env;
  actor: Actor | null;
  requestId: string;
  routeDef: RouteDef;
  requestHeaders: Headers;
}) {
  const { env, actor, requestId, routeDef, requestHeaders } = params;

  const client = createClient<paths>({
    baseUrl: "http://r2-service",
    fetch: (req) => env.R2_SERVICE.fetch(req as Request),
  });

  client.use({
    onRequest({ request }) {
      const headers = new Headers(requestHeaders);
      sanitizeActorHeaders(headers);
      headers.delete("x-internal-token");
      headers.delete("authorization");

      headers.forEach((value, key) => {
        request.headers.set(key, value);
      });

      if (actor) {
        const actorHeaders = actorToHeaders(actor);
        for (const [key, value] of Object.entries(actorHeaders)) {
          request.headers.set(key, value);
        }
      }

      request.headers.set("x-gateway-token", env.GATEWAY_TO_BACKEND_TOKEN);
      request.headers.set("x-request-id", requestId);
      request.headers.set("x-route-id", routeDef.id);
      return request;
    },
  });

  return client;
}

export async function proxyToR2(params: {
  env: Env;
  actor: Actor | null;
  requestId: string;
  routeDef: RouteDef;
  requestHeaders: Headers;
  rpcPath: R2RpcPath;
  body: unknown;
}): Promise<Response> {
  const { env, actor, requestId, routeDef, requestHeaders, rpcPath, body } = params;
  const r2 = makeR2Client({ env, actor, requestId, routeDef, requestHeaders });

  let upstreamResponse: Awaited<ReturnType<typeof r2.POST>>;
  try {
    upstreamResponse = await r2.POST(rpcPath as never, { body } as never);
  } catch (error) {
    throw new GatewayError({
      status: 502,
      code: "upstream_unreachable",
      message: "Upstream unavailable",
      cause: error,
    });
  }

  const { data, error, response } = upstreamResponse;
  if (error || !response.ok) {
    throw new GatewayError({
      status: response.status,
      code: "upstream_error",
      message: "Upstream request failed",
      details: error,
    });
  }

  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("x-request-id", requestId);

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: responseHeaders,
  });
}
