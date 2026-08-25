const FRONTEND_ORIGINS = ["https://밥.net", "https://xn--rh3b.net", "https://www.xn--rh3b.net"];
const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

const MCP_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "MCP-Protocol-Version, Mcp-Session-Id",
};

function getAllowedOrigins(): string[] {
  return process.env.NODE_ENV === "production" ? FRONTEND_ORIGINS : [...FRONTEND_ORIGINS, ...DEV_ORIGINS];
}

export function isMcpPath(path: string): boolean {
  return path === "/mcp" || path === "/mcp/";
}

export function getCorsHeaders(origin: string | null, path = ""): Record<string, string> {
  if (isMcpPath(path)) {
    return MCP_CORS_HEADERS;
  }

  const allowedOrigins = getAllowedOrigins();
  const isAllowed = !!origin && allowedOrigins.includes(origin);
  return {
    ...(isAllowed && origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin");
    const path = new URL(req.url).pathname;
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin, path),
    });
  }
  return null;
}

export function withCors(response: Response, origin: string | null, path: string): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(getCorsHeaders(origin, path))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
