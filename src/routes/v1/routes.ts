import type { Actor, Env, RouteClass, RouteDef } from "../../types";
import { GatewayError } from "../../errors/gatewayError";
import { getBearerToken } from "../../policies/auth/bearer";
import { actorFromJwt } from "../../policies/auth/actor";
import { verifyJwt } from "../../policies/auth/verifyJwt";
import { assertInternalToken } from "../../policies/internal/requireInternalToken";
import { rateLimitKey } from "../../policies/rateLimit/key";
import { enforceRateLimit } from "../../policies/rateLimit/limiter";
import { proxyToR2, type R2RpcPath } from "../../upstreams/r2";
import { proxyToGithub } from "../../upstreams/github";
import { proxyToGoogleDrive } from "../../upstreams/googleDrive";

const r2RpcRoutes: Array<{ method: string; class: RouteClass }> = [
  { method: "r2_bucket_list", class: "read" },
  { method: "r2_bucket_create", class: "write" },
  { method: "r2_bucket_delete", class: "write" },
  { method: "r2_file_list", class: "read" },
  { method: "r2_file_get", class: "read" },
  { method: "r2_file_head", class: "read" },
  { method: "r2_file_save", class: "write" },
  { method: "r2_file_delete", class: "write" },
  { method: "r2_file_move", class: "write" },
  { method: "r2_file_transfer", class: "write" },
  { method: "r2_file_bulk_delete", class: "write" },
  { method: "r2_file_bulk_content", class: "read" },
  { method: "r2_reference_resolve", class: "read" },
  { method: "r2_credentials_temporary_create", class: "write" },
  { method: "r2_bucket_cors_get", class: "read" },
  { method: "r2_bucket_cors_set", class: "write" },
  { method: "r2_bucket_cors_delete", class: "write" },
  { method: "r2_bucket_lifecycle_get", class: "read" },
  { method: "r2_bucket_lifecycle_set", class: "write" },
  { method: "r2_bucket_lifecycle_delete", class: "write" },
  { method: "r2_bucket_public_get", class: "read" },
  { method: "r2_bucket_public_set", class: "write" },
  { method: "r2_bucket_domain_list", class: "read" },
  { method: "r2_bucket_domain_add", class: "write" },
  { method: "r2_bucket_domain_delete", class: "write" },
  { method: "r2_bucket_notification_list", class: "read" },
  { method: "r2_bucket_notification_set", class: "write" },
  { method: "r2_bucket_notification_delete", class: "write" },
  { method: "r2_bucket_lock_get", class: "read" },
  { method: "r2_bucket_lock_set", class: "write" },
  { method: "r2_metrics_get", class: "read" },
];

const r2Routes: RouteDef[] = r2RpcRoutes.map(({ method, class: routeClass }) => ({
  id: method.replaceAll("_", "-"),
  method: "POST",
  path: `/api/v1/${method}`,
  upstreamPath: `/rpc/${method}`,
  auth: "required",
  class: routeClass,
}));

export const routes: RouteDef[] = [
  ...r2Routes,
  {
    id: "google-drive-drives-create",
    method: "POST",
    path: "/api/v1/google_drive_drives_create",
    upstreamPath: "/rpc/google_drive_drives_create",
    auth: "required",
    class: "write",
  },
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

  const rpcMethod = match.upstreamPath.substring("/rpc/".length).split("?")[0];
  const upstreamPathWithQuery = match.upstreamPath + url.search;

  if (isR2RpcPath(match.upstreamPath)) {
    const body = await request.json();
    return proxyToR2({
      env,
      actor,
      requestId,
      routeDef: match.route,
      requestHeaders: new Headers(request.headers),
      rpcPath: match.upstreamPath,
      body,
    });
  }

  const proxyParams = {
    request,
    env,
    upstreamPath: upstreamPathWithQuery,
    actor,
    requestId,
    routeDef: match.route,
  };

  if (rpcMethod.startsWith("github_")) {
    return proxyToGithub(proxyParams);
  }
  if (rpcMethod.startsWith("google_drive_")) {
    return proxyToGoogleDrive(proxyParams);
  }

  throw new GatewayError({
    status: 404,
    code: "rpc_method_not_found",
    message: `RPC method '${rpcMethod}' not supported`,
  });
}

function isR2RpcPath(path: string): path is R2RpcPath {
  return r2Routes.some((route) => route.upstreamPath === path);
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
