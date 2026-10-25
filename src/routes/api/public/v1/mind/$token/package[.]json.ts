import { createFileRoute } from "@tanstack/react-router";
import { ipRateLimit } from "@/lib/api-guard.server";

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
      GET: async ({ params, request }) => {
        const limited = ipRateLimit(request, "mind-package", 60, cors);
        if (limited) return limited;
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

        // Complete Edition: older stored packages get the same bundle fields,
        // and every package ships its own pre-configured runner + 1-line start.
        const { evermindRunnerScript, quickStartCommand } = await import("@/lib/robot-deploy");
        const stored = (data.package ?? {}) as Record<string, unknown>;
        const origin = new URL(request.url).origin;
        const bundle = {
          ...stored,
          edition: "complete",
          behavior_tree: stored.behavior_tree ?? null,
          movement_drills: stored.movement_drills ?? [],
          tactical_playbook: stored.tactical_playbook ?? null,
          quick_start: quickStartCommand(token),
          runner: { filename: "evermind_runner.py", script: evermindRunnerScript(origin, token) },
        };
        return Response.json(bundle, {
          headers: { ...cors, "Cache-Control": "public, max-age=30" },
        });
      },
    },
  },
});
