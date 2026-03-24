const productionOrigins = ["https://xn--rh3b.net", "https://밥.net", "https://xn--3o2bl7m86e.xn--rh3b.net", "https://상록원.밥.net"];
const devOrigins = ["http://localhost:3000", "http://localhost:3001"];

const allowedOrigins =
  process.env.NODE_ENV === "production" ? productionOrigins : [...productionOrigins, ...devOrigins];

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0],
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
