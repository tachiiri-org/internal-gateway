export class GatewayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof GatewayError) {
    const body: ErrorBody = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    };
    return jsonResponse(body, error.status, requestId);
  }

  const body: ErrorBody = {
    error: {
      code: "internal_error",
      message: "Internal Server Error",
      requestId,
    },
  };
  return jsonResponse(body, 500, requestId);
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
