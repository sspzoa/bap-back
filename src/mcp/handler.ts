import { createMcpHandler } from "@modelcontextprotocol/server";
import { type BapMcpOptions, createBapMcpServer } from "@/mcp/server";

export function createBapMcpHandler(options: BapMcpOptions) {
  return createMcpHandler(() => createBapMcpServer(options));
}
