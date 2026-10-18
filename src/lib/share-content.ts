export type ShareContent = {
  kind: "video" | "project" | "mind";
  id: string;
  title: string;
  url: string;
  creator?: string;
  image?: string | null;
  handle?: string;
  topics?: string[];
  mindId?: string | null;
};

export function shareUrl(raw: string): string {
  try {
    const url = new URL(raw, "https://ever-mind.dev");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

export function participantId(content: ShareContent): string | null {
  if (content.kind === "video") return null;
  return content.mindId || `${content.kind === "mind" ? "persona" : "project"}:${content.id}`;
}