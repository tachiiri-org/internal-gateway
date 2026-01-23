import { errorResponse, jsonResponse } from "./errors/gatewayError";
import { getRequestId } from "./logging/requestId";
import { handleV1Request } from "./routes/v1/routes";
import type { Env } from "./types";

export async function handleRequest(
  request: Request,
  env: Env,
  requestId: string,
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return jsonResponse({ status: "ok" }, 200, requestId);
  }
  return handleV1Request({ request, env, requestId });
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
