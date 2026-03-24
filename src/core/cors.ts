import { getRegistry } from "@/providers/registry";

const devOrigins = ["http://localhost:3000", "http://localhost:3001"];

function getAllowedOrigins(): string[] {
  const registry = getRegistry();
  const providerOrigins = registry.getAllOrigins();
  return process.env.NODE_ENV === "production" ? providerOrigins : [...providerOrigins, ...devOrigins];
}

export function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const isAllowed = origin && allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0] || "*",
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
