import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

const MAX_CHARS = 60_000;

export default defineTool({
  name: "get_mind",
  title: "Get a Mind Vault",
  description:
    "Read the full mined payload (story, transcript, topics, emotions, traits) of one Mind Vault owned by the signed-in creator.",
  inputSchema: {
    mind_id: z.string().describe("Mind Vault id, from list_minds."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ mind_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("mind_vaults")
      .select("id,title,kind,persona_id,project_id,payload,created_at,updated_at")
      .eq("id", mind_id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) throw new ToolError(`No Mind Vault found with id ${mind_id}`);

    let text = JSON.stringify(data, null, 2);
    if (text.length > MAX_CHARS) {
      text = `${text.slice(0, MAX_CHARS)}\n... [truncated, mind payload is larger than ${MAX_CHARS} characters]`;
    }
    return { content: [{ type: "text", text }] };
  },
});
