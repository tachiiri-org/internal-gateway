import type { RateLimitClass } from "../../types";

export interface RouteDefinition {
  id: string;
  pathPrefix: string;
  upstreamPrefix: string;
  rateClass: RateLimitClass;
}

const routes: RouteDefinition[] = [
  {
    id: "rpc",
    pathPrefix: "/api/v1",
    upstreamPrefix: "/rpc",
    rateClass: "read",
  },
];

export function matchV1Route(pathname: string): {
  upstreamPath: string;
  rateClass: RateLimitClass;
} | null {
  for (const route of routes) {
    if (pathname === route.pathPrefix || pathname.startsWith(`${route.pathPrefix}/`)) {
      const suffix = pathname.slice(route.pathPrefix.length);
      return {
        upstreamPath: `${route.upstreamPrefix}${suffix}`,
        rateClass: route.rateClass,
      };
    }
  }
  return null;
}
