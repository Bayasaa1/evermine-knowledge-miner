// Owned file (banner removed): adds a per-IP rate limit before the MCP handler.
// route: /mcp
// emitted to: src/routes/mcp.ts

import { createFileRoute } from "@tanstack/react-router";

import { createTanStackMcpHandler } from "@lovable.dev/mcp-js/stacks/tanstack";

import mcp from "../lib/mcp/index";
import { ipRateLimit } from "../lib/api-guard.server";

const mcpHandler = createTanStackMcpHandler(mcp, {
  resourcePath: "/mcp",
  metadataPath: "/.well-known/oauth-protected-resource",
  trustForwardedHost: true,
  trustForwardedProto: true,
});

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: (ctx: Parameters<typeof mcpHandler>[0]) => ipRateLimit(ctx.request, "mcp", 60) ?? mcpHandler(ctx),
    },
  },
});
