/** Shared Architect Co-Pilot card types (browser-safe). */
export type ArchitectCard =
  | { type: "video"; videoId: string; url: string; title: string; author: string; durationSec: number; thumbnail: string; projectId?: string; personaId?: string }
  | { type: "health"; projectId: string; title: string; score: number; strengths: string[]; gaps: string[] }
  | { type: "fix"; projectId: string; vaultId: string; patches: { question: string; answer: string }[]; notes: string[]; personaName?: string }
  | { type: "stress"; projectId: string; tests: { question: string; answer: string; verdict: string }[] }
  | { type: "projects"; projects: { id: string; title: string }[]; next: string }
  | { type: "persona"; projectId: string; name: string };

export type ArchitectResult = {
  text: string;
  provider?: string;
  model?: string;
  actions_taken: string[];
  interactive_cards: ArchitectCard[];
};

