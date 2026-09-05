import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPersonas from "./tools/list-personas";
import listProjects from "./tools/list-projects";
import listContent from "./tools/list-content";
import listMinds from "./tools/list-minds";
import getMind from "./tools/get-mind";
import searchFeed from "./tools/search-feed";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "evermine-your-mind-s-vault",
  title: "Evermine: Your Mind's Vault",
  version: "0.1.0",
  instructions:
    "Tools for Evermind, a platform where creators mine videos into AI Mind Vaults. Use `list_personas` to find creator identities, `list_projects` and `list_content` to walk a persona's projects and mined videos, `list_minds` and `get_mind` to read mined brains (story, transcript, topics, emotions), and `search_feed` to browse published minds. All tools act as the signed-in Evermind user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPersonas, listProjects, listContent, listMinds, getMind, searchFeed],
});
