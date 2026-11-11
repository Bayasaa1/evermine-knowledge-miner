/** Shared Architect Co-Pilot card types (browser-safe). */
export type MindDirective = {
  id: string; mindId: string; mindName: string; mindAvatar: string | null;
  severity: "critical" | "warning" | "enhance";
  issueSummary: string; directiveForChatbot: string;
  suggestedTool: "resume_mining" | "deepen_legacy_vaults" | "repair_timings" | "rebuild_core_brain" | "clear_failed_jobs" | "draft_post";
  targetProjectId: string;
};
export type AttachedMind = { mindId: string; name: string; avatar: string | null; kind: "persona" | "project" };
export type ArchitectCard =
  | { type: "video"; videoId: string; url: string; title: string; author: string; durationSec: number; thumbnail: string; projectId?: string | undefined; personaId?: string | undefined }
  | { type: "health"; projectId: string; title: string; score: number; strengths: string[]; gaps: string[] }
  | { type: "fix"; projectId: string; vaultId: string; patches: { question: string; answer: string }[]; notes: string[]; personaName?: string | undefined }
  | { type: "stress"; projectId: string; tests: { question: string; answer: string; verdict: string }[] }
  | { type: "projects"; projects: { id: string; title: string }[]; next: string }
  | { type: "persona"; projectId: string; name: string }
  | { type: "system_audit"; score: number; issues: SystemAuditIssue[]; fixable: boolean }
  | { type: "heal_result"; fixed: string[]; notes: string[]; remaining: number }
  | { type: "mine_link"; url: string; title: string; author: string; durationSec: number; thumbnail: string; projects: { id: string; title: string; personaId: string }[] }
  | { type: "remine"; projectId: string; personaId: string; title: string; urls: string[] }
  | { type: "role_split"; keyCount: number; liveKeys: number; backgroundKeys: number };

export type SystemAuditIssue = { id: string; label: string; count: number; detail: string; fixable: boolean };

export type ArchitectResult = {
  text: string;
  provider?: string | undefined;
  model?: string | undefined;
  actions_taken: string[];
  interactive_cards: ArchitectCard[];
  directives?: MindDirective[];
  operator?: { jobId?: string; projectId?: string; postId?: string; draft?: string; clipUrl?: string; published?: boolean };
  operatorMind?: { id: string; name: string };
};

