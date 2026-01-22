// TODO: rate limit
// TODO: auth/claimsの検証（今は透過）
// TODO: request-id 付与・伝搬
// TODO: エラーの正規化（今はbackend透過）

export default {
  async fetch(request: Request, env: { BACKEND: Fetcher }): Promise<Response> {
    const url = new URL(request.url);

    // Gatewayは /api/* のみを入口にする（将来拡張）
    if (!url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }

    // /api/foo -> /rpc/foo にリライト
    const rewrittenPath = url.pathname.replace(/^\/api\//, "/rpc/");
    const backendUrl = new URL(rewrittenPath + url.search, "https://backend.internal");

    const forwarded = new Request(backendUrl.toString(), request);
    return env.BACKEND.fetch(forwarded);
  },
};
