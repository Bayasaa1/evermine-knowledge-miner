import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_minds",
  title: "List Mind Vaults",
  description: "List the signed-in creator's saved Mind Vaults (mined .json.md brains), newest first.",
  inputSchema: {
    persona_id: z.string().optional().describe("Only return minds belonging to this persona id."),
    project_id: z.string().optional().describe("Only return minds belonging to this project id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ persona_id, project_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("mind_vaults")
      .select("id,title,kind,persona_id,project_id,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (persona_id) query = query.eq("persona_id", persona_id);
    if (project_id) query = query.eq("project_id", project_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { minds: data ?? [] },
    };
  },
});
