const FRONTEND_ORIGINS = ["https://밥.net", "https://xn--rh3b.net", "https://www.xn--rh3b.net"];
const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

function getAllowedOrigins(): string[] {
  return process.env.NODE_ENV === "production" ? FRONTEND_ORIGINS : [...FRONTEND_ORIGINS, ...DEV_ORIGINS];
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
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
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(origin),
    });
  }
  return null;
}
