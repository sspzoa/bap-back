const FRONTEND_ORIGINS = ["https://밥.net", "https://xn--rh3b.net", "https://www.xn--rh3b.net"];
const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

export function allowedFrontendOrigins(): string[] {
  return process.env.NODE_ENV === "production" ? FRONTEND_ORIGINS : [...FRONTEND_ORIGINS, ...DEV_ORIGINS];
}

export const MCP_CORS = {
  origin: true as const,
  methods: ["GET", "POST", "DELETE", "OPTIONS"] as const,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "MCP-Protocol-Version",
    "Mcp-Session-Id",
    "Last-Event-ID",
  ],
  exposeHeaders: ["MCP-Protocol-Version", "Mcp-Session-Id"],
};
