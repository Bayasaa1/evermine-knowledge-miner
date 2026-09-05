import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_content",
  title: "List mined content",
  description:
    "List mined videos inside one of the signed-in creator's projects, with titles, tags and source links.",
  inputSchema: {
    project_id: z.string().describe("Project id to list content for."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ project_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("project_content")
      .select("id,project_id,kind,title,description,tags,youtube_id,source_url,mind_id,view_count,created_at")
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { content: data ?? [] },
    };
  },
});
