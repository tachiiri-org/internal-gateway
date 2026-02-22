// @ts-check
import { readFileSync, writeFileSync } from "fs";

const sources = JSON.parse(readFileSync("openapi-sources.json", "utf-8"));

const gatewaySecuritySchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Auth0 JWT token (required for authenticated routes)",
  },
  internalToken: {
    type: "apiKey",
    in: "header",
    name: "x-internal-token",
    description: "Internal token for Pages → Gateway communication (required for all routes)",
  },
};

const gatewayErrorSchema = {
  type: "object",
  required: ["error_code", "message", "request_id"],
  properties: {
    error_code: { type: "string" },
    message: { type: "string" },
    request_id: { type: "string" },
    details: {},
  },
};

const gatewayErrorResponses = {
  "400": { $ref: "#/components/responses/GatewayError" },
  "401": { $ref: "#/components/responses/GatewayError" },
  "403": { $ref: "#/components/responses/GatewayError" },
  "404": { $ref: "#/components/responses/GatewayError" },
  "429": { $ref: "#/components/responses/GatewayError" },
  "500": { $ref: "#/components/responses/GatewayError" },
  "502": { $ref: "#/components/responses/GatewayError" },
};

const mergedPaths = {};
const mergedSchemas = { GatewayError: gatewayErrorSchema };

for (const source of sources.sources) {
  console.log(`Fetching ${source.url} ...`);
  const res = await fetch(source.url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${source.url}: ${res.status} ${res.statusText}`);
  }
  /** @type {any} */
  const spec = await res.json();

  // Merge schemas (adapter-defined schemas are kept as-is; $ref resolution stays intact)
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    mergedSchemas[name] = schema;
  }

  // Transform paths: /rpc/service_method → /api/v1/service_method
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const newPath = path.replace(/^\/rpc/, "/api/v1");
    const newPathItem = {};

    for (const [method, operation] of Object.entries(pathItem)) {
      // Pass through non-operation fields (parameters, summary, etc.)
      if (typeof operation !== "object" || operation === null) {
        newPathItem[method] = operation;
        continue;
      }

      const isOptions = method.toLowerCase() === "options";
      const security = isOptions
        ? [{ internalToken: [] }]
        : [{ bearerAuth: [], internalToken: [] }];

      newPathItem[method] = {
        ...operation,
        security,
        // Gateway error responses take lower priority; adapter-defined responses override
        responses: { ...gatewayErrorResponses, ...(operation.responses ?? {}) },
      };
    }

    mergedPaths[newPath] = newPathItem;
  }
}

const output = {
  openapi: "3.1.0",
  info: {
    title: "internal-gateway",
    version: "1.0.0",
    description: "Cloudflare Worker gateway for tachiiri services.",
  },
  components: {
    securitySchemes: gatewaySecuritySchemes,
    schemas: mergedSchemas,
    responses: {
      GatewayError: {
        description: "Gateway error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/GatewayError" },
          },
        },
      },
    },
  },
  paths: mergedPaths,
};

writeFileSync("openapi.json", JSON.stringify(output, null, 2) + "\n");
console.log("openapi.json generated successfully.");
