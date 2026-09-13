# Remove the AI miner picker, improve the keys list

## What you asked

1. Delete the whole "Pick the AI that mines your videos" panel (the box in your screenshot).
2. Improve the "My AI keys" list on top.

## Changes

### 1. Delete the miner picker panel

- Remove the panel from setup step 3 and from the "start mining" section in `guided-studio.tsx`.
- Delete the `miner-pool.tsx` component file.
- Mining simply uses your Gemini key (the default brain), which step 3 already requires. No AI choice is lost — extra keys you saved still help as backup thinkers where the pipeline already uses them.
- The picker code in `miner-pool.ts` that other parts of the app still read (saved choice, reasoning helpers) stays untouched, so nothing else breaks.

### 2. One thing the picker used to do moves into the keys list

Choosing which OpenRouter model to use (Llama, Qwen-VL, etc.) was inside that panel. It moves to the OpenRouter row of "My AI keys": tap the row to open a small model chooser, each model still marked free or paid.

### 3. Improve "My AI keys"

- Rows grouped in two clear sections: **Ready** (working keys) and **Needs attention** (rejected or used-up keys).
- Each row shows: provider name, masked key ending, status word with color, cost note (free tier / free model / paid), and today's call count — same as now, but tidier spacing and icons for status (green check / amber warning).
- Each row gains small sense badges (video, audio, text, image) so you can see what that provider can actually do for your videos.
- Paid keys keep the on/off switch and monthly limit, unchanged.
- Gemini note ("free tier, billing optional") and the "Evermind never uses its own AI budget" line stay.

## Technical notes

- Files: `src/components/guided-studio.tsx` (remove two `<MinerPool>` render sites and the unused import/state), delete `src/components/miner-pool.tsx`, rewrite `src/components/ai-keys-card.tsx` (grouped rows, status icons, sense badges, OpenRouter model chooser via existing `setProviderModel`).
- `src/lib/miner-pool.ts`, `src/lib/key-manager.ts`, `miner-reason.ts`, `mind-auditor.tsx` unchanged — the saved default choice (Gemini) keeps mining working.
- Copy added in English, Mongolian, Korean for the new section labels and model chooser.
- Verify with typecheck and a browser check of `/creator` step 3 and the mining section.
