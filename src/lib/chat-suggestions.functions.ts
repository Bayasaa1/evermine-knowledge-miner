import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ChatSuggestions = {
  bio: string;
  greeting: string;
  tags: string[];
  topics: string[];
  /** Creator-picked questions shown first. */
  creatorQuestions: string[];
  /** Real questions asked to the persona inside the mined videos. */
  videoQuestions: string[];
  branches: Record<string, string[]>;
  topicAliases?: Record<string, string[]>;
};

/** Deterministic chat starters — no AI call, built from creator + mined data. */
export const getChatSuggestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ mindId: z.string().max(80) }).parse(input))
  .handler(async ({ data }): Promise<ChatSuggestions | null> => {
    const { loadCreatorExtras } = await import("./mind-qa.server");
    const x = await loadCreatorExtras(data.mindId);
    if (!x) return null;
    return {
      bio: x.bio.slice(0, 400),
      greeting: x.greeting.slice(0, 400),
      tags: x.tags.slice(0, 12),
      topics: x.topics,
      creatorQuestions: x.qa.filter((q) => q.suggest).map((q) => q.question).slice(0, 6),
      videoQuestions: x.minedQuestions.slice(0, 12),
      branches: x.branches,
      topicAliases: x.topicAliases ?? {},
    };
  });
