# Your step-1 choice drives steps 3 and 4 — plus fixing the rejected free keys

## 1. Your choice stays visible in steps 3 and 4

A small chip at the top of step 3 and step 4 shows what you picked in step 1
("Gaming clone", "Knowledge", ...), with a link back to step 1 to change it.
The advice box in step 3 already follows that choice; step 4 gets a one-line
reminder of what kind of videos suit it.

## 2. "Recommended" labels on the key list

Each creation type gets a ranked shortlist of AI providers. In both the free and
paid add lists, and on each saved key row:

- **Recommended** (green) — genuinely helps this creation type.
- **Team** (neutral) — useful as a backup when #1 runs out.
- **Not recommended** (muted) — adds cost or time without adding quality here.

Gaming example: Gemini marked required/recommended (it is the only one that
watches the screen), DeepSeek and Claude marked recommended as the tactic
writers, Groq/Cerebras marked team backups, Perplexity marked not recommended.
Each label carries a one-line reason, so it never looks arbitrary.

Saved keys that are recommended but sitting low in the order get a gentle
"move this to #2" hint, since your order decides what actually runs.

## 3. Why Cerebras and Together were rejected

Both services do accept requests from the browser, so the block is not the
connection — the test call itself is failing, most likely on the model name the
test uses (free model names on both services change), and the app then shows a
single generic "rejected" for every possible cause.

Fix:

- Test a key by asking the service for its **model list** first — that proves
  the key is valid without depending on any model name. Only if that is not
  supported does it fall back to a tiny chat call.
- Try a small list of candidate model names instead of one hard-coded name, and
  remember the one that worked as that key's model.
- Show the **actual reason** the service gave (bad key, no credit, unknown
  model, rate limited) instead of "rejected", so you know what to do next.
- Correct the Together endpoint so the key page you visit (api.together.ai) and
  the address used match.

## 4. Account-side save no longer silently drops keys

The background save accepts only the original eight providers, so Cerebras,
Together, GitHub Models, Grok, Perplexity, Cohere and custom keys were stored on
this device only. That list gets extended to every provider, so a key saved on
your phone also works when mining continues with your tab closed.

## Technical notes

- `src/lib/key-manager.ts`: `ProviderInfo` gains `testModels: string[]` and
  `modelsPath`; `PROVIDERS` fixed for Cerebras/Together (base URL + candidate
  models). New `recommendationFor(category)` map returning
  `recommended | team | avoid` + reason per provider id, in en/mn/ko
  (lives in `src/lib/key-advice.ts` next to `adviceFor`).
- `src/components/ai-keys-card.tsx`: `testKey` returns
  `{ ok, model?, reason? }` — GET `{baseUrl}/models` first, then chat fallback
  over `testModels`; error text surfaced via toast. Badges rendered on provider
  choices and saved rows from `recommendationFor(category)`.
- `src/components/guided-studio.tsx`: category chip above steps 3 and 4.
- `src/lib/user-ai-keys.functions.ts`: widen the `PROVIDER` enum to all ids.
- Verify with a typecheck and a browser pass over `/creator` step 3.
