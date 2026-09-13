# Make "team backup" understandable — and make adding a teammate one click

"Team backup" is a label with no explanation and no way to act on it. Three changes fix that.

## 1. Clearer words instead of "Team backup"

The badge on each AI becomes plain language:

- **Required** — Gemini, the only one that watches the video.
- **Best partner** (green) — genuinely improves what you picked in step 1.
- **Stand-in** (grey) — replaces the one above when its daily tokens run out.
- **Not worth it here** (muted) — costs money or time without improving this kind of mind.

## 2. Tap a badge to get the guide

Every badge becomes a button. Tapping it opens a short panel under that row:

- What this label means in one sentence.
- Why this AI got that label for the creation type you chose.
- What happens when the AI above it runs out (the order takes over automatically).
- For a stand-in: a line saying it never runs unless the ones above it stop.

Tapping again closes it. Works on phones (no hover-only tooltip).

## 3. A "Suggested teammates" strip — add one in a click

Above the two add buttons, a short strip lists the best partners for your creation
type that you have **not** added yet. Gaming, for example, shows DeepSeek and Claude.

Each entry shows the name, one line on what it adds, and an **Add** button that:

- opens the add form already switched to that AI (free or paid list, whichever it is),
- shows a direct link to the page where you create that AI's key,
- after the key is tested and saved, places it right below Gemini instead of at the
  bottom, so it actually gets used.

When every suggested teammate is already in the list, the strip says so instead.

## Technical notes

- `src/lib/key-advice.ts`: rename `RecLevel` copy (`team` -> "Stand-in",
  `recommended` -> "Best partner"); extend `Recommendation` with a longer
  `explain` string per level plus a `fallbackNote`, all in en/mn/ko. Add
  `suggestedTeam(category, installedIds)` returning the recommended provider ids
  the user has not saved yet.
- `src/components/ai-keys-card.tsx`:
  - `RecBadge` becomes a `<button>` with `onClick` toggling `openRec` state keyed
    by row/provider id; the explain panel renders beneath the row and beneath the
    provider choice card.
  - New `SuggestedTeam` block before the add buttons; its Add button sets
    `mode` from `provider.paid` and `setProvider(id)`, and sets a
    `placeAfterGemini` flag consumed after a successful save (call `moveKey` up
    until the new row sits at rank 2).
  - Add the new copy keys to `COPY` for en/mn/ko.
- Verify with `bunx tsgo --noEmit` and a browser pass over `/creator` step 3.
