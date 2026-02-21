const ACTOR_HEADERS = [
  "x-actor-kind",
  "x-actor-sub",
  "x-actor-scopes",
  "x-actor-tenant",
];

export function sanitizeActorHeaders(headers: Headers): void {
  for (const header of ACTOR_HEADERS) {
    headers.delete(header);
  }
}
