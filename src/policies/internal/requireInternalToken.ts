import type { Env } from "../../types";
import { GatewayError } from "../../errors/gatewayError";

export function assertInternalToken(request: Request, env: Env): void {
  const token = request.headers.get("x-internal-token");
  if (!token || token !== env.PAGES_TO_GATEWAY_TOKEN) {
    throw new GatewayError(403, "forbidden", "Invalid internal token");
  }
}
