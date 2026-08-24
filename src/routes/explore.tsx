import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  Brain,
  Compass,
  Search,
  Sparkles,
  Send,
  Star,
  Clock,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { ModeSwitch } from "@/components/mode-switch";

export const Route = createFileRoute("/explore")({
  head: () => ({
    meta: [
      { title: "Evermine — Mind Marketplace" },
      {
        name: "description",
        content:
          "Browse Evermine Mind Vaults and test a conversation with an AI Clone built from a creator's mined knowledge.",
      },
      { property: "og:title", content: "Evermine — Mind Marketplace" },
      {
        property: "og:description",
        content: "Browse Mind Vaults and talk with AI Clones built from real expertise.",
      },
    ],
  }),
  component: Explore,
});

type Mind = {
  id: string;
  name: string;
  domain: string;
  bio: string;
  tags: string[];
  rating: number;
  hourly: number;
  perQuery: number;
  access: "public" | "private";
  sample: string[];
};

const MINDS: Mind[] = [
  {
    id: "mind_horsemaster",
    name: "Batbold — Horseman's Mind",
    domain: "Traditional horsemanship",
    bio: "Forty years of steppe riding, training and breeding distilled into decision logic and beliefs.",
    tags: ["Horses", "Training", "Nomadic craft"],
    rating: 4.9,
    hourly: 40,
    perQuery: 0.5,
    access: "public",
    sample: [
      "A nervous horse is never corrected with speed — you slow yourself first, then it follows.",
      "Pick the saddle for the ride ahead, not for the horse you had last year.",
    ],
  },
  {
    id: "mind_chef",
    name: "Saraa — Kitchen Mind",
    domain: "Fermentation & steppe cuisine",
    bio: "Recipes, timing intuition and taste-memory captured from 300 hours of kitchen video.",
    tags: ["Cooking", "Fermentation", "Dairy"],
    rating: 4.7,
    hourly: 28,
    perQuery: 0.35,
    access: "public",
    sample: [
      "Airag tells you it is ready by sound before it tells you by taste.",
      "If the room is cold, give it a day. Never give it more starter.",
    ],
  },
  {
    id: "mind_founder",
    name: "Erdene — Founder Mind",
    domain: "Early-stage startups",
    bio: "Fundraising, hiring and product-cut decisions from a decade of building companies.",
    tags: ["Startups", "Fundraising", "Hiring"],
    rating: 4.8,
    hourly: 120,
    perQuery: 1.2,
    access: "public",
    sample: [
      "Cut the feature that only the loudest customer wants; keep the one the quiet ones use daily.",
      "Hire slow for judgement roles, fast for craft roles.",
    ],
  },
  {
    id: "mind_dancer",
    name: "Nomin — Movement Mind",
    domain: "Contemporary dance",
    bio: "Choreography logic, body mechanics and rehearsal method with tagged keyframe motion.",
    tags: ["Dance", "Choreography", "Motion"],
    rating: 4.6,
    hourly: 35,
    perQuery: 0.4,
    access: "private",
    sample: [
      "Count the breath, not the beat — the beat is where the audience is, the breath is where you are.",
      "Learn the ending first; the middle then has somewhere to go.",
    ],
  },
];

type Msg = { role: "user" | "agent"; text: string };

function Explore() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Mind>(MINDS[0]!);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MINDS;
    return MINDS.filter((m) =>
      [m.name, m.domain, m.bio, ...m.tags].some((v) => v.toLowerCase().includes(q)),
    );
  }, [query]);

  useEffect(() => {
    setMessages([
      {
        role: "agent",
        text: `You're talking with a preview of ${selected.name}. Ask about ${selected.domain.toLowerCase()} — answers are drawn from this Mind Vault's mined knowledge.`,
      },
    ]);
  }, [selected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const send = () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setThinking(true);
    const line = selected.sample[messages.length % selected.sample.length] ?? selected.sample[0]!;
    window.setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: "agent",
          text: `${line}\n\n(Preview response — full sessions unlock at $${selected.perQuery.toFixed(2)} per query.)`,
        },
      ]);
      setThinking(false);
    }, 700);
  };

  return (
    <div className="dark min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl min-w-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">
                Mind Marketplace
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Browse Mind Vaults and talk with AI Clones
              </p>
            </div>
          </div>
          <ModeSwitch />
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div className="flex min-w-0 flex-wrap items-center gap-4 rounded-[12px] border border-border bg-card px-4 py-4 sm:px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Explorer Mode
            </p>
            <p className="text-sm font-semibold text-foreground">
              {MINDS.length} Mind Vaults available in preview
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-status-green" />
            Signed vaults only
          </div>
        </div>

        <div className="grid min-w-0 gap-6 xl:grid-cols-[1.25fr_1fr]">
          <section className="min-w-0 space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search minds, skills or domains…"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {filtered.map((m) => {
                const active = m.id === selected.id;
                return (
                  <article
                    key={m.id}
                    className={`flex min-w-0 flex-col rounded-[12px] border bg-card p-5 transition-colors ${
                      active ? "border-primary/70" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-foreground">{m.name}</h3>
                        <p className="truncate text-xs text-muted-foreground">{m.domain}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs text-foreground">
                        <Star className="h-3 w-3 text-status-amber" />
                        {m.rating.toFixed(1)}
                      </span>
                    </div>
                    <p className="mt-3 flex-1 text-sm text-muted-foreground">{m.bio}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {m.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />${m.hourly}/hr
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5" />${m.perQuery.toFixed(2)}/query
                        </span>
                      </div>
                      <button
                        onClick={() => setSelected(m)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {active ? "Talking" : "Talk"}
                      </button>
                    </div>
                  </article>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground">No minds match that search.</p>
              )}
            </div>
          </section>

          <section className="flex min-w-0 flex-col rounded-[12px] border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">{selected.name}</h3>
                <p className="truncate text-xs text-muted-foreground">
                  Preview agent · {selected.access === "public" ? "Public vault" : "Private vault"}
                </p>
              </div>
            </div>

            <div ref={scrollRef} className="min-h-[280px] flex-1 space-y-3 overflow-y-auto p-5">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] whitespace-pre-wrap rounded-[12px] px-3.5 py-2.5 text-sm ${
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {thinking && (
                <div className="max-w-[85%] rounded-[12px] bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                  Thinking…
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border p-4">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send();
                }}
                placeholder="Ask this mind something…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                onClick={send}
                disabled={!input.trim() || thinking}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
