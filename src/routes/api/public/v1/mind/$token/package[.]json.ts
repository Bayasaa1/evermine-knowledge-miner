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
  "Access-Control-Allow-Headers": "content-type, authorization",
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

        // Entitlement guard: paid Minds ship only to their owner or an active buyer.
        const { data: owner } = await supabaseAdmin
          .from("robot_packages")
          .select("user_id, mind_id")
          .eq("deploy_token", token)
          .maybeSingle();
        const mindId = owner?.mind_id ?? data.mind_id;
        let price = 0;
        const projectId = mindId.startsWith("project:") ? mindId.slice(8) : "";
        if (/^[0-9a-f-]{36}$/i.test(projectId)) {
          const { data: p } = await supabaseAdmin
            .from("projects")
            .select("price, plan_tiers")
            .eq("id", projectId)
            .maybeSingle();
          const tiers = (p?.plan_tiers ?? null) as Record<string, unknown> | null;
          if (tiers?.["enabled"] === true) price = Number(p?.price ?? 0) || 1;
        }
        if (price > 0) {
          const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
          const { data: who } = bearer ? await supabaseAdmin.auth.getUser(bearer) : { data: { user: null } };
          const uid = who?.user?.id ?? null;
          let allowed = !!uid && uid === owner?.user_id;
          if (!allowed && uid) {
            const { data: rows } = await supabaseAdmin
              .from("mind_purchases")
              .select("mind_id, expires_at")
              .eq("user_id", uid)
              .eq("mind_id", mindId);
            const now = Date.now();
            allowed = (rows ?? []).some((r) => !r.expires_at || new Date(r.expires_at).getTime() > now);
          }
          if (!allowed) {
            return Response.json(
              { error: "This is a paid Mind. Buy it to download the bundle." },
              { status: 402, headers: { ...cors, "Cache-Control": "no-store" } },
            );
          }
        }

        // Complete Edition: older stored packages get the same bundle fields,
        // and every package ships its own pre-configured runner + 1-line start.
        const { evermindRunnerScript, quickStartCommand } = await import("@/lib/robot-deploy");
        const stored = (data.package ?? {}) as Record<string, unknown>;
        const origin = new URL(request.url).origin;
        const bundle = {
          ...stored,
          edition: "complete",
          behavior_tree: stored["behavior_tree"] ?? null,
          movement_drills: stored["movement_drills"] ?? [],
          tactical_playbook: stored["tactical_playbook"] ?? null,
          quick_start: quickStartCommand(token),
          runner: { filename: "evermind_runner.py", script: evermindRunnerScript(origin, token) },
        };
        return Response.json(bundle, {
          headers: { ...cors, "Cache-Control": price > 0 ? "private, no-store" : "public, max-age=30" },
        });
      },
    },
  },
});
