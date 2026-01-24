import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import gateway from "../src/index";
import type { Actor, Env, JwtClaims } from "../src/types";
import { actorFromJwt, actorToHeaders, headersToActor } from "../src/policies/auth/actor";
import { clearJwksCache } from "../src/policies/auth/verifyJwt";

type Jwk = Awaited<ReturnType<typeof exportJWK>>;

afterEach(() => {
  clearJwksCache();
});

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

function baseEnv(): Env {
  return {
    R2_SERVICE: createMockBackend(),
    GITHUB_SERVICE: createMockBackend(),
    GOOGLE_DRIVE_SERVICE: createMockBackend(),
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
  const body = (await response.json()) as {
    error: { code: string; message: string; requestId: string };
  };
  assert.equal(body.error.code, "forbidden");
  assert.equal(body.error.message, "Invalid internal token");
  assert.ok(body.error.requestId);
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
  const body = (await response.json()) as {
    error: { code: string; message: string; requestId: string };
  };
  assert.equal(body.error.code, "unauthorized");
  assert.equal(body.error.message, "Missing bearer token");
  assert.ok(body.error.requestId);
});

test("health endpoint does not require jwt", async () => {
  const env = baseEnv();
  const request = new Request("https://gateway.example/health", {
    method: "GET",
  });

  const response = await gateway.fetch(request, env);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { status: string };
  assert.equal(body.status, "ok");
});

test("actor headers conversion is stable with scopes", () => {
  const actor: Actor = {
    kind: "user",
    sub: "user-123",
    scopes: ["read:items", "write:items"],
    tenant: "acme",
  };

  const headers = new Headers(actorToHeaders(actor));
  const reconstructed = headersToActor(headers);

  assert.equal(reconstructed.kind, "user");
  assert.equal(reconstructed.sub, "user-123");
  assert.deepEqual(reconstructed.scopes, ["read:items", "write:items"]);
  assert.equal(reconstructed.tenant, "acme");
});

test("actor generation handles empty scopes", () => {
  const claims: JwtClaims = {
    sub: "user-456",
    iss: "https://issuer.example",
  };

  const actor = actorFromJwt(claims);
  assert.equal(actor.sub, "user-456");
  assert.deepEqual(actor.scopes, []);
  assert.deepEqual(actor.raw, { iss: "https://issuer.example", aud: undefined });
});

test("unsupported RPC method returns 404", async () => {
  const env = baseEnv();
  const { token, jwk } = await createJwt(env);

  const originalFetch = globalThis.fetch;
  try {
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

    const request = new Request("https://gateway.example/api/v1/unsupported_method", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "x-internal-token": env.PAGES_TO_GATEWAY_TOKEN,
      },
    });

    const response = await gateway.fetch(request, env);
    assert.equal(response.status, 404);
    const body = (await response.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    assert.equal(body.error.code, "rpc_method_not_found");
    assert.ok(body.error.requestId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


