import { createFileRoute } from "@tanstack/react-router";
import { getLiveClone } from "@/lib/persona-clone.server";

/**
 * The face a caller should see for a published Mind.
 *
 * Returns nothing unless the persona owner built a face clone and consented,
 * so a creator's face is never shown without their say-so.
 */
export const Route = createFileRoute("/api/mind-face")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const mindId = new URL(request.url).searchParams.get("mindId") ?? "";
        const clone = mindId ? await getLiveClone(mindId, "face") : null;
        const imageUrl = clone && /^https:\/\//.test(clone.remoteId) ? clone.remoteId : null;
        return new Response(JSON.stringify({ imageUrl }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
        });
      },
    },
  },
});
