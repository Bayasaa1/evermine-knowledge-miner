import { createFileRoute } from "@tanstack/react-router";

/**
 * Robot OTA endpoint. A physical robot scans the deployment QR code (or issues a
 * plain HTTP GET) and receives the compiled Vision-Language-Action package,
 * spatial coordinates and knowledge graph for its local runtime memory.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export const Route = createFileRoute("/api/public/v1/mind/$token/package.json")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ params }) => {
        const token = String(params.token ?? "").trim();
        if (!/^[a-f0-9]{8,64}$/i.test(token)) {
          return Response.json({ error: "Invalid deployment token" }, { status: 400, headers: cors });
        }

        // Privileged server-only client: the token-scoped RPC is no longer
        // executable by anon/authenticated API roles.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Token-scoped RPC: never exposes deploy_token or other creators' rows.
        const { data, error } = await supabaseAdmin
          .rpc("get_published_mind_package", { _token: token })
          .maybeSingle();


        if (error) {
          return Response.json({ error: "Deployment lookup failed" }, { status: 502, headers: cors });
        }
        if (!data) {
          return Response.json({ error: "Mind package not found or unpublished" }, { status: 404, headers: cors });
        }

        return Response.json(data.package, {
          headers: { ...cors, "Cache-Control": "public, max-age=30" },
        });
      },
    },
  },
});
