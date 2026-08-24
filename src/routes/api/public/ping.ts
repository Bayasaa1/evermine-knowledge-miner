import { createFileRoute } from "@tanstack/react-router";

/** Tiny latency probe used by the mobile client to measure round-trip time. */
export const Route = createFileRoute("/api/public/ping")({
  server: {
    handlers: {
      GET: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }),
      HEAD: async () =>
        new Response(null, {
          status: 204,
          headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
        }),
    },
  },
});
