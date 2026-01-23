import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import gateway from "../src/index";
import type { Env } from "../src/types";

type Jwk = Awaited<ReturnType<typeof exportJWK>>;

async function createJwt(env: Env) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = (await exportJWK(publicKey)) as Jwk & { kid?: string; use?: string; alg?: string };
  jwk.kid = "test-key";
  jwk.use = "sig";
  jwk.alg = "RS256";

  const token = await new SignJWT({ scope: "read:items write:items", tenant: "acme" })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuedAt()
    .setIssuer(env.AUTH0_ISSUER)
    .setAudience(env.AUTH0_AUDIENCE)
    .setSubject("user-123")
    .sign(privateKey);

  return { token, jwk };
}

function createMockBackend(onRequest?: (req: Request) => void): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      onRequest?.(request);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  } as Fetcher;
}

function baseEnv(backendMock?: Fetcher): Env {
  return {
    BACKEND: backendMock ?? createMockBackend(),
    PAGES_TO_GATEWAY_TOKEN: "internal-token",
    GATEWAY_TO_BACKEND_TOKEN: "gateway-token",
    AUTH0_ISSUER: "https://auth.example/",
    AUTH0_AUDIENCE: "https://api.example",
    AUTH0_JWKS_URL: "https://auth.example/.well-known/jwks.json",
  };
}

test("missing internal token returns 403", async () => {
  const env = baseEnv();
  const request = new Request("https://gateway.example/api/v1/echo", {
    method: "GET",
  });

  const response = await gateway.fetch(request, env);
  assert.equal(response.status, 403);
});

test("missing jwt returns 401", async () => {
  const env = baseEnv();
  const request = new Request("https://gateway.example/api/v1/echo", {
    method: "GET",
    headers: {
      "x-internal-token": env.PAGES_TO_GATEWAY_TOKEN,
    },
  });

  const response = await gateway.fetch(request, env);
  assert.equal(response.status, 401);
});

test("actor headers are overwritten and gateway token is added", async () => {
  let backendRequest: Request | null = null;
  const backendMock = createMockBackend((req) => {
    backendRequest = req;
  });
  const env = baseEnv(backendMock);
  const { token, jwk } = await createJwt(env);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.url === env.AUTH0_JWKS_URL) {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  };

  const request = new Request("https://gateway.example/api/v1/echo?x=1", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-internal-token": env.PAGES_TO_GATEWAY_TOKEN,
      "x-actor-sub": "spoofed",
      "x-actor-scopes": "spoofed",
    },
    body: "hello",
  });

  const response = await gateway.fetch(request, env);
  assert.equal(response.status, 200);
  assert.ok(backendRequest, "expected backend request");
  const ensuredRequest = backendRequest as Request;
  assert.equal(ensuredRequest.url, "https://backend.internal/rpc/echo?x=1");
  assert.equal(ensuredRequest.headers.get("x-actor-sub"), "user-123");
  assert.equal(
    ensuredRequest.headers.get("x-actor-scopes"),
    "read:items write:items",
  );
  assert.equal(ensuredRequest.headers.get("x-actor-tenant"), "acme");
  assert.equal(ensuredRequest.headers.get("x-gateway-token"), env.GATEWAY_TO_BACKEND_TOKEN);
});
