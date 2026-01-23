export function getRequestId(request: Request): string {
  const existing = request.headers.get("x-request-id");
  return existing ?? crypto.randomUUID();
}
