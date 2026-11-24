/** Sends queued hot-wallet payouts (creator shares + cold-wallet sweeps). Cron-only. */
import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/cron/crypto-payouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) {
          const { isAuthorizedCaller } = await import("@/lib/crypto-send");
          if (!isAuthorizedCaller(request.headers.get("authorization"), process.env["MINING_CRON_SECRET"])) return denied;
        }
        const { processPayouts } = await import("@/lib/crypto-send.server");
        const r = await processPayouts(5);
        return new Response(JSON.stringify({ ok: true, ...r }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
