# Clear up "Gemini Pro paid" and the OpenRouter confusion

## First: your Lovable credits are not being used

I searched the whole app for any call to Lovable's shared AI service and any use of the shared app key. There are zero. Every AI call goes out with a key you pasted yourself.

"Gemini Pro" in the picker does **not** mean Lovable credits. It means: the same Gemini key you already added, but on a Google account where you switched on Google's own paid tier. Money would go to Google, not to Lovable — and only if you enabled it on Google's side. Since it uses the exact same key as the free Gemini, having it as a separate tile is pure confusion.

## What actually happened with Qwen-VL

Qwen-VL, Llama Vision and OpenRouter are three tiles that all use **one and the same OpenRouter key**. So:

- You clicked Qwen-VL → it asked for an OpenRouter key (correct, that is where Qwen runs).
- You saved the key → Llama Vision lit up too, because it uses the same key.
- Your key list showed one row, "OpenRouter — paid", because OpenRouter is labelled paid as a company — even though the models Qwen-VL and Llama Vision use are the free ones.

Nothing was charged. But the screen told you three contradictory things, which is the real bug.

## The fixes

**1. Remove the "Gemini Pro" tile.**
It is the same key as Gemini. Instead, the Gemini row in My AI keys gets one short line: "Free tier. If you turn on billing in your own Google account, this same key just runs faster — Evermind never asks for it."

**2. Group the OpenRouter tiles honestly.**
Qwen-VL, Llama Vision and OpenRouter become one card: **OpenRouter (one key)**, with the model chosen inside it (Qwen-VL frames · Llama Vision frames · other models). Picking a model no longer looks like adding a second provider, and one key saved never silently lights up an unrelated tile.

**3. Make "paid" mean what it says.**
The key list stops labelling a provider paid/free as a company. Each row says what it costs *you as used here*:
- Gemini — free tier
- Groq, Mistral — free tier
- OpenRouter — free models selected (and if you switch to a paid model inside the card, the row changes to "paid model selected" with your spending limit shown)
- ChatGPT, Claude, Kimi, DeepSeek — paid, off until you switch on

**4. Stop the spending-limit switch from blocking free use.**
Right now OpenRouter counts as paid, so the off-switch and the monthly limit can block it even though you are on free models. With free models selected it is simply usable; the switch and limit only appear when a paid model is chosen.

**5. One line, everywhere it matters.**
Under My AI keys: "Every call runs on your own keys. Evermind never bills you and never uses its own AI budget."

## Technical notes

- `src/lib/miner-pool.ts`: drop the `gemini-pro` miner; merge `qwen-vl` / `llama-vision` into the `openrouter` option with a `models[]` list (each with id, free/paid flag, what it does); update the per-category pools so the counts still work.
- `src/lib/key-manager.ts`: replace the static `paid: boolean` with a resolved per-row cost state (`free-tier` / `free-model` / `paid`); `providerUsable()` returns true for OpenRouter when the selected model is free.
- `src/components/ai-keys-card.tsx`: render the resolved cost state, show the on/off + cap controls only for genuinely paid rows, add the "your keys only" line (en/mn/ko).
- `src/components/miner-pool.tsx`: one OpenRouter card with an inner model chooser; remove the Gemini Pro tile.
- No change to how keys are stored or to the credential chain.
