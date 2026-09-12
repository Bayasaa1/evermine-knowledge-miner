/**
 * Viewer Core Brain — shared types, stage rules, and merge helpers.
 *
 * A brain is plain data injected into the creator Mind's prompt. It is never
 * a second AI: one model (the creator's Mind) runs per answer, with the brain
 * as context.
 */

export type RelationshipStage = "new" | "regular" | "close" | "inner";

export type BrainFact = {
  id: string;
  key: string;
  value: string;
  editedByUser: boolean;
  createdAt: string;
};

export type BrainMoment = {
  id: string;
  date: string;
  title: string;
  note: string;
  pinnedByUser: boolean;
  source: "chat" | "voice" | "video" | "update" | "manual";
  createdAt: string;
};

export type BrainThread = {
  id: string;
  topic: string;
  status: "open" | "closed";
  createdAt: string;
};

export type BrainAchievement = {
  id: string;
  kind:
    | "first_meeting"
    | "first_voice"
    | "first_video"
    | "talks_10"
    | "talks_50"
    | "talks_100"
    | "streak_week"
    | "streak_month"
    | "topic_mastered"
    | "longest_talk"
    | "early_supporter";
  title: string;
  unlockedAt: string;
};

export type ViewerBrainPayload = {
  aboutMe: BrainFact[];
  topics: string[];
  blockedTopics: string[];
  moments: BrainMoment[];
  achievements: BrainAchievement[];
  threads: BrainThread[];
  summary: string;
  earliestSummary: string;
  languages: string[];
  level: string;
  goals: string[];
};

export type ViewerBrainStats = {
  sessions: number;
  talkSeconds: number;
  lastSeenAt: string | null;
  stage: RelationshipStage;
};

export type ViewerBrain = {
  id: string;
  userId: string;
  mindId: string;
  projectId: string | null;
  creatorUserId: string | null;
  sharedWithCreator: boolean;
  payload: ViewerBrainPayload;
  stats: ViewerBrainStats;
  createdAt: string;
  updatedAt: string;
};

export function stageFromTalks(talks: number): RelationshipStage {
  if (talks >= 100) return "inner";
  if (talks >= 20) return "close";
  if (talks >= 3) return "regular";
  return "new";
}

export function stageLabel(stage: RelationshipStage): string {
  switch (stage) {
    case "new":
      return "New";
    case "regular":
      return "Regular";
    case "close":
      return "Close";
    case "inner":
      return "Inner circle";
  }
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ensurePayload(p: unknown): ViewerBrainPayload {
  const raw = (typeof p === "object" && p !== null ? p : {}) as Partial<ViewerBrainPayload>;
  return {
    aboutMe: Array.isArray(raw.aboutMe) ? raw.aboutMe : [],
    topics: Array.isArray(raw.topics) ? raw.topics : [],
    blockedTopics: Array.isArray(raw.blockedTopics) ? raw.blockedTopics : [],
    moments: Array.isArray(raw.moments) ? raw.moments : [],
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
    threads: Array.isArray(raw.threads) ? raw.threads : [],
    summary: typeof raw.summary === "string" ? raw.summary : "",
    earliestSummary: typeof raw.earliestSummary === "string" ? raw.earliestSummary : "",
    languages: Array.isArray(raw.languages) ? raw.languages : [],
    level: typeof raw.level === "string" ? raw.level : "",
    goals: Array.isArray(raw.goals) ? raw.goals : [],
  };
}

export function buildPromptContext(
  brain: ViewerBrain,
  langName: string,
  latestUpdateTitle?: string,
): string {
  const p = brain.payload;
  const lines: string[] = [];
  lines.push(`RELATIONSHIP MEMORY — the viewer you are talking to:`);
  lines.push(`- Viewer stage: ${stageLabel(brain.stats.stage)} (${brain.stats.sessions} talks, ${Math.round(brain.stats.talkSeconds / 60)} minutes together)`);
  if (p.level) lines.push(`- Viewer level: ${p.level}`);
  if (p.languages?.length) lines.push(`- Languages used: ${p.languages.join(", ")}; active language now: ${langName}`);
  if (p.goals?.length) lines.push(`- Viewer goals: ${p.goals.join("; ")}`);
  if (p.aboutMe?.length) {
    const facts = p.aboutMe.filter((f) => !(p.blockedTopics ?? []).includes(f.key)).map((f) => `${f.key}: ${f.value}`);
    if (facts.length) lines.push(`- About this viewer:\n  - ${facts.join("\n  - ")}`);
  }
  if (p.threads?.length) {
    const open = p.threads.filter((t) => t.status === "open");
    if (open.length) lines.push(`- Open threads to follow up on:\n  - ${open.map((t) => t.topic).join("\n  - ")}`);
  }
  if (p.moments?.length) {
    const recent = p.moments.slice(-5);
    lines.push(`- Recent shared moments:\n  - ${recent.map((m) => `${m.date}: ${m.title}${m.note ? ` — ${m.note}` : ""}`).join("\n  - ")}`);
  }
  if (p.achievements?.length) {
    lines.push(`- Achievements together: ${p.achievements.map((a) => a.title).join(", ")}`);
  }
  if (p.summary) lines.push(`- Long-term summary: ${p.summary}`);
  if (p.earliestSummary) lines.push(`- Early years summary: ${p.earliestSummary}`);
  if (latestUpdateTitle) lines.push(`- NEW UPDATE from the creator: "${latestUpdateTitle}". Open by mentioning it naturally if it fits the conversation.`);
  lines.push(`Treat this viewer as someone you know. Use their name/facts only when natural. Do not repeat this block.`);
  return lines.join("\n");
}

export function addOrUpdateFact(
  facts: BrainFact[],
  key: string,
  value: string,
  opts?: { editedByUser?: boolean },
): BrainFact[] {
  const edited = !!opts?.editedByUser;
  const existing = facts.find((f) => f.key.toLowerCase() === key.toLowerCase());
  if (existing) {
    if (existing.editedByUser && !edited) return facts; // AI merge never overwrites user edits
    return facts.map((f) =>
      f.id === existing.id ? { ...f, value, editedByUser: edited || f.editedByUser } : f,
    );
  }
  return [...facts, { id: newId(), key, value, editedByUser: edited, createdAt: new Date().toISOString() }];
}

export function mergeSessionIntoBrain(
  brain: ViewerBrain,
  session: {
    startedAt: string;
    endedAt: string;
    mode: "chat" | "voice" | "video";
    turns: { role: "user" | "agent"; text: string }[];
    seconds: number;
    lang: string;
    latestUpdateTitle: string | undefined;
  },
): ViewerBrain {
  const p = ensurePayload(brain.payload);
  const next = { ...brain, payload: p };
  next.stats.sessions += 1;
  next.stats.talkSeconds += Math.max(0, session.seconds);
  next.stats.lastSeenAt = session.endedAt;
  next.stats.stage = stageFromTalks(next.stats.sessions);

  if (!p.languages?.includes(session.lang)) {
    p.languages = [...(p.languages || []), session.lang];
  }

  // Always record the session as a moment; user can edit/delete later.
  const firstUser = session.turns.find((t) => t.role === "user")?.text.slice(0, 80) ?? "Talked";
  p.moments = [
    ...(p.moments || []),
    {
      id: newId(),
      date: session.startedAt,
      title: `${session.mode === "video" ? "Video call" : session.mode === "voice" ? "Voice call" : "Chat"}: ${firstUser}`,
      note: "",
      pinnedByUser: false,
      source: session.mode,
      createdAt: new Date().toISOString(),
    },
  ];

  // Achievements
  const achievements = new Map(p.achievements?.map((a) => [a.kind, a]) ?? []);
  if (!achievements.has("first_meeting") && next.stats.sessions >= 1) {
    achievements.set("first_meeting", { id: newId(), kind: "first_meeting", title: "First meeting", unlockedAt: session.endedAt });
  }
  if (!achievements.has("first_voice") && session.mode === "voice") {
    achievements.set("first_voice", { id: newId(), kind: "first_voice", title: "First voice call", unlockedAt: session.endedAt });
  }
  if (!achievements.has("first_video") && session.mode === "video") {
    achievements.set("first_video", { id: newId(), kind: "first_video", title: "First video call", unlockedAt: session.endedAt });
  }
  if (!achievements.has("talks_10") && next.stats.sessions >= 10) {
    achievements.set("talks_10", { id: newId(), kind: "talks_10", title: "10 talks together", unlockedAt: session.endedAt });
  }
  if (!achievements.has("talks_50") && next.stats.sessions >= 50) {
    achievements.set("talks_50", { id: newId(), kind: "talks_50", title: "50 talks together", unlockedAt: session.endedAt });
  }
  if (!achievements.has("talks_100") && next.stats.sessions >= 100) {
    achievements.set("talks_100", { id: newId(), kind: "talks_100", title: "100 talks together", unlockedAt: session.endedAt });
  }
  if (!achievements.has("longest_talk")) {
    achievements.set("longest_talk", { id: newId(), kind: "longest_talk", title: "Longest conversation", unlockedAt: session.endedAt });
  }
  if (session.latestUpdateTitle && !achievements.has("early_supporter")) {
    achievements.set("early_supporter", { id: newId(), kind: "early_supporter", title: "Early supporter", unlockedAt: session.endedAt });
  }
  p.achievements = Array.from(achievements.values());

  return next;
}

export function sanitizePayload(input: unknown): ViewerBrainPayload {
  const p = ensurePayload(input);
  // The full archive is kept; prompt-context limiting happens in buildPromptContext.
  return p;
}

export function limitPromptContext(payload: ViewerBrainPayload): ViewerBrainPayload {
  return {
    ...payload,
    aboutMe: payload.aboutMe.slice(-40),
    topics: payload.topics.slice(-60),
    blockedTopics: payload.blockedTopics.slice(-40),
    moments: payload.moments.slice(-20),
    threads: payload.threads.slice(-20),
    goals: payload.goals.slice(-20),
  };
}
