import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_feed",
  title: "Search published minds",
  description: "Search Evermind's published marketplace projects by title or description.",
  inputSchema: {
    query: z.string().trim().describe("Words to look for in project titles and descriptions."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const term = query.replace(/[%,()]/g, " ").trim();
    let request = supabase
      .from("projects")
      .select("id,title,description,creator_name,price,currency,view_count,created_at")
      .eq("published", true)
      .order("view_count", { ascending: false })
      .limit(25);
    if (term) request = request.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
    const { data, error } = await request;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { results: data ?? [] },
    };
  },
});
