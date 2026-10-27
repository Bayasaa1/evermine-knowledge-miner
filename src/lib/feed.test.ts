import { describe, expect, test } from "bun:test";
import { rankFeedForViewer, type FeedItem } from "./feed";
import { sanitizeInterests } from "./feed-interests";

const item = (id: string, creator: string, category: FeedItem["category"], title: string): FeedItem => ({
  id, mindId: creator, creator, handle: creator, title, description: "", category,
  src: null, poster: "", tags: [], price: 0, currency: "USD", publishedAt: "2026-01-01",
});

const feed = [
  item("cook", "ramsay", "movement", "Perfect steak recipe"),
  item("robot", "figure", "robot", "Humanoid robot demo"),
  item("btc", "trader", "knowledge", "Bitcoin market crash explained"),
  item("cs2", "shroud", "gaming", "CS2 tactical aim guide"),
];

describe("personalised feed ranking", () => {
  test("Crypto & Finance + FPS picks move matching videos to the top", () => {
    const interests = sanitizeInterests({ tags: ["crypto-finance", "fps"] });
    const top = rankFeedForViewer(feed, { interests }).slice(0, 2).map((x) => x.id);
    expect(top.sort()).toEqual(["btc", "cs2"]);
  });

  test("never shows 3 videos from one creator in a row", () => {
    const many = [1, 2, 3, 4].map((n) => item(`s${n}`, "shroud", "gaming", "CS2 aim"));
    const out = rankFeedForViewer([...many, item("x", "other", "knowledge", "x")], {
      interests: sanitizeInterests({ tags: ["fps"] }),
    });
    expect(out.slice(0, 3).map((x) => x.creator)).toEqual(["shroud", "shroud", "other"]);
  });

  test("quick skips push a video down", () => {
    const signals = { byItem: { cook: { dwellMs: 500, skips: 2 } }, byCreator: {} };
    const out = rankFeedForViewer(feed, { signals });
    expect(out[out.length - 1]?.id).toBe("cook");
  });

  test("no interests keeps original order", () => {
    expect(rankFeedForViewer(feed).map((x) => x.id)).toEqual(feed.map((x) => x.id));
  });
});
