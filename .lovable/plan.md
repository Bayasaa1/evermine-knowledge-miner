# One ranked AI key list — order, more providers, free/paid split, custom AI

## What changes

The miner picker box in the first screenshot is deleted. Everything moves into the
"My AI keys" list, which becomes a numbered, ordered fallback chain.

## 1. Delete the miner picker

- Remove the "Pick the AI that mines your videos" panel from setup step 3 and from
  the mining screen; delete its component file.
- The key list now decides which AI is used, so nothing is lost.

## 2. Numbered list with hierarchy arrows

- Every saved key shows a number: **#1** is used first. When #1 runs out of tokens
  or hits its limit, #2 is used, then #3, and so on automatically.
- Up/down arrows on each row move it in the order; the numbers renumber instantly.
- A row that is out of quota shows as skipped until its quota resets (Gemini's free
  quota resets daily), and the next one takes over.
- Order is saved per account, so it survives reload and applies to mining, chat and
  translation alike.

## 3. Free / Paid split with two buttons

Two add buttons instead of one row of chips:

- **Get a free key** — shows only free providers.
- **Get a paid key** — shows only paid providers.

Each provider in the chosen list shows its name, what it is good at, and a direct
link to where to create the key. A free provider never appears under paid and vice
versa.

## 4. Six more AIs

Free (added): **Cerebras**, **Together AI**, **GitHub Models**.
Paid (added): **xAI Grok**, **Perplexity**, **Cohere**.

Total: 7 free (Gemini, Groq, Mistral, Cerebras, Together, GitHub Models, OpenRouter
free models) and 7 paid (ChatGPT, Claude, Kimi, DeepSeek, Grok, Perplexity, Cohere).
Each new one gets the same test-before-save check, cost note and usage counter.

## 5. Custom AI

An **Add my own AI** entry in both lists: name, endpoint URL (OpenAI-compatible),
model name, and key. It joins the same numbered order and gets tested like the rest.

## 6. Recommendations and guide that follow "What are you creating today?"

Above the list, a short box that changes with the chosen creation type
(Knowledge, Robot Brain, Voice Agent, Sales, Gaming):

- Which AI should sit at #1 and why.
- Which extra AI genuinely helps that type, and which adds cost for no gain.
- 3–4 speed tips for that type (e.g. public YouTube links only, start with one
  short video, extra Gemini keys from the same Google project share quota).

Wording stays honest: Gemini is the one that actually watches the video; the others
reason over what Gemini extracted.

## Technical notes

- `src/lib/key-manager.ts`: add `rank` to each saved key (stored on the keystore
  entry for Gemini keys, on `ProviderSetting` for the rest), `listAllKeys()` sorts by
  rank, plus `moveKey(row, "up" | "down")`.
- `src/lib/api-keys.ts`: `credentialChain()` and `bestGeminiKey()` follow the saved
  rank instead of insertion order; exhausted/over-cap rows are skipped, not dropped.
- `src/lib/key-manager.ts` `PROVIDERS`: 6 new entries with `baseUrl`, `testModel`,
  `keyUrl`, `paid`, `costPer1k`; custom provider handled as a `custom` id whose
  endpoint/model come from the stack.
- `src/components/ai-keys-card.tsx`: rewritten — numbered rows, arrows, free/paid add
  buttons, custom AI form, purpose guide box (takes a `category` prop).
- New `src/lib/key-advice.ts`: per-category recommendation + tips in en/mn/ko.
- `src/components/guided-studio.tsx`: drop both `<MinerPool>` render sites, pass
  `category` into `AiKeysCard`; delete `src/components/miner-pool.tsx`.
- Verify with typecheck and a browser pass over `/creator` step 3.
