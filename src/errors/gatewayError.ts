export interface GatewayErrorOptions {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
}

export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly cause?: unknown;

  constructor(options: GatewayErrorOptions) {
    super(options.message);
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.details = options.details;
    this.cause = options.cause;
  }
}

interface ErrorBody {
  error_code: string;
  message: string;
  request_id: string;
  details?: unknown;
}

export function isGatewayError(error: unknown): error is GatewayError {
  return error instanceof GatewayError;
}

export function toGatewayError(error: unknown, requestId: string): GatewayError {
  if (isGatewayError(error)) {
    if (error.requestId) {
      return error;
    }
    return new GatewayError({
      status: error.status,
      code: error.code,
      message: error.message,
      requestId,
      details: error.details,
      cause: error.cause,
    });
  }

  return new GatewayError({
    status: 500,
    code: "internal_error",
    message: "Internal Server Error",
    requestId,
    cause: error,
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  const gatewayError = toGatewayError(error, requestId);
  const body: ErrorBody = {
    error_code: gatewayError.code,
    message: gatewayError.message,
    request_id: gatewayError.requestId ?? requestId,
    details: gatewayError.details,
  };
  return jsonResponse(body, gatewayError.status, gatewayError.requestId ?? requestId);
}

export function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": requestId,
    },
  });
}
