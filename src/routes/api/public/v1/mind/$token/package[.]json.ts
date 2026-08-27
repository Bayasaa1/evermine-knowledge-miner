import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
                h.delete("Authorization");
              }
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const { data, error } = await supabase
          .from("robot_packages")
          .select("mind_id, title, package, updated_at")
          .eq("deploy_token", token)
          .eq("published", true)
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
