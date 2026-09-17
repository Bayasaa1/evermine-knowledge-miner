import { createFileRoute } from "@tanstack/react-router";

/**
 * How much AI a mind's owner allows: where the slider starts and its maximum.
 * Public read — it is only two numbers about a published mind.
 */
export const Route = createFileRoute("/api/mind-level")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const mindId = new URL(request.url).searchParams.get("mindId") ?? "";
        let def = 100;
        let max = 100;
        if (mindId.startsWith("project:")) {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("projects")
              .select("ai_level_default, ai_level_max")
              .eq("id", mindId.slice(8))
              .maybeSingle();
            const clamp = (v: unknown, fallback: number) => {
              const n = Math.round(Number(v));
              return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : fallback;
            };
            max = clamp(data?.ai_level_max, 100);
            def = Math.min(clamp(data?.ai_level_default, 100), max);
          } catch {
            /* defaults are fine */
          }
        }
        return new Response(JSON.stringify({ default: def, max }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=120" },
        });
      },
    },
  },
});
