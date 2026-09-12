# Viewer Core Brain — memory of the viewer/creator relationship (single AI, memory-augmented)

Every viewer gets their own Core Brain for each creator they talk to. It remembers who
they are, what they asked, what they achieved together, and the moments that mattered —
and it grows with every chat, voice call and video call. The Mind reads it before every
answer, so it never meets the viewer as a stranger again.

## What the viewer gets

New **My Core Brains** section in Profile:

- One card per creator the viewer has a brain with: creator name, "met on" date, number
  of talks, total time, chat/voice/video counts, and the current relationship stage
  (New → Regular → Close → Inner circle).
- Opening a card shows:
  - **About me** — what the Mind learned about this viewer (goals, level, interests,
    language), editable by the viewer.
  - **Moments** — memorable exchanges with dates; the viewer can pin their own note to
    any moment or add a moment by hand.
  - **Achievements** — first meeting, first voice call, first video call, 10/50/100
    talks, weekly streak, topics mastered, longest conversation.
  - **Open threads** — things the Mind promised to follow up on.
  - **Privacy** — Private or Shared with creator (default Private), delete a single
    moment, or forget everything with this creator.
- **Ask / react / request** panel: the viewer can send the creator a question, a
  reaction, or a content request straight from the brain card. Shared brains let the
  creator answer.

## What the creator gets

In Creator Studio, a **Subscribers & signals** panel, built for any audience size
(100 viewers or 100 million — the creator never has to read individuals one by one):

- **Auto-FAQ**: viewer questions and requests are clustered by topic, so the same
  question asked by thousands surfaces once with its count. The creator answers once
  and the answer is pushed back into the Mind's brain — every future viewer asking it
  gets the creator's answer instantly, without the creator touching anything.
- **Trending demand**: most-requested topics this week, so the creator knows exactly
  what content to make next.
- **Audience summary**: aggregate stats — how many brains exist, shared vs private,
  languages, viewer levels, relationship stages — no personal details.
- **Searchable subscriber list**: shared brains only, sortable by most active, longest
  streak, newest, with search. A creator can zoom into one relationship when they want.
- Access rule per project: chat/calls open to everyone, or subscribers only (creator's
  choice, default open). Enforced server-side on the chat and call routes.
- Incoming viewer questions, reactions and content requests, grouped with counts.
- Private brains never appear here — only aggregate counts.

## How the memory grows

1. A chat or call session ends (modal closed or 2 min idle).
2. The session's new turns are summarised with the viewer's own Gemini key, then merged
   into the existing brain — facts are updated, not appended forever (bounded: 40
   moments, 30 facts, newest kept, oldest compressed into a summary line).
3. Without an AI key, the brain still records facts that need no AI: dates, counts,
   durations, achievements, languages used, and raw pinned moments. The card says
   memory summaries are paused until a key is added.
4. Before every answer, the Mind's prompt receives the brain as plain text context: who
   it is talking to, shared history, achievements, open threads. Voice and video calls
   use the same route, so they share one memory. Only one AI runs per answer — the
   creator's Mind. The viewer brain is data, not a second AI.

## When the creator posts an update

- Publishing new content or a new Mind version creates an update entry for that project.
- Every subscriber gets a notification in the bell (localized, with the creator's name
  and what changed) and the project card shows a "New" badge until they open it.
- The feed puts the newest update from creators the viewer follows at the top of their
  home feed for its first days, so subscribers experience the latest work first.
- The Mind is told what is new: it opens the next conversation by mentioning the update
  ("I just released X — want to go through it?") and answers from the newest version
  first, noting when something changed since they last talked.
- The viewer's brain records the update as a shared moment ("was there on day one"),
  which feeds streak and early-supporter achievements.


## Technical notes

Migration (additive only):

- `public.viewer_brains` — `id`, `user_id`, `mind_id`, `project_id` (nullable),
  `creator_user_id` (nullable), `shared_with_creator boolean default false`,
  `payload jsonb default '{}'` (facts, moments, achievements, threads, stats),
  `sessions int`, `talk_seconds int`, `last_seen_at`, timestamps; unique
  `(user_id, mind_id)`. GRANTs for `authenticated` + `service_role`; RLS: viewer
  full access on own rows; creator SELECT only when
  `shared_with_creator = true AND creator_user_id = auth.uid()`.
- `public.viewer_signals` — viewer questions/reactions/requests: `user_id`,
  `mind_id`, `creator_user_id`, `kind` (`question` | `reaction` | `request`), `body`,
  `status`, `creator_reply`, timestamps. Viewer manages own rows; creator reads and
  replies to rows addressed to them. A `topic` column (filled by AI on the viewer's
  key when present, else keyword buckets) powers FAQ clustering at any scale.
- `projects.chat_access text default 'open'` (`open` | `subscribers`).
- `public.creator_updates` — `project_id`, `creator_user_id`, `mind_id`, `kind`
  (`content` | `version` | `note`), `title`, `body`, `created_at`. Public SELECT for
  published projects; creator writes own rows.
- `public.update_reads` — `user_id`, `update_id`, `read_at`, so the bell badge and the
  "New" markers clear per viewer.

Code:

- `src/lib/viewer-brain.ts` — types, stage/achievement rules, bounding/merge helpers.
- `src/lib/viewer-brain.functions.ts` — authenticated server functions: load, list,
  merge session, edit facts, pin/delete moment, set sharing, wipe.
- `src/lib/viewer-signals.functions.ts` — send/list/reply signals.
- `src/routes/api/mind-chat.ts` — load the caller's brain, inject a `RELATIONSHIP
  MEMORY` block into the system prompt, and enforce `chat_access` against
  `mind_purchases` when the creator set subscribers-only.
- `src/components/talk-to-mind-modal.tsx` — track session start/end and call the merge
  server function on close; show a small "remembers you" badge.
- `src/components/viewer-brain-hub.tsx` — the Profile section and detail sheet.
- `src/routes/profile.tsx` — mount the hub.
- `src/components/subscriber-signals.tsx` + Creator Studio tab — access rule, auto-FAQ
  with clustered questions and answer-once publishing, trending demand, aggregate
  audience summary, searchable shared-brain list, signal inbox.
- `src/lib/creator-updates.functions.ts` — write an update on publish/new version, list
  unread updates for a viewer's subscriptions, mark read.
- `src/components/notification-center.tsx` — add a "New from your creators" group.
- `src/lib/feed.ts` — boost recent updates from subscribed creators to the top.
- All new copy localized in English, Mongolian and Korean, phone-width layouts.

Not included: payments changes; paid checkout still shows the existing "coming soon"
notice.
