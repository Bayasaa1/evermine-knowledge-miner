# Make the free AIs actually work — and show the team on one line

## What is really wrong

The free keys you added are never called. I traced it: the second "thinking"
stage still asks the old miner picker (the screen we deleted) which AI to use.
With that screen gone, the answer is always "Gemini", and the code then stops
early with "Gemini already did the thinking in stage 1". So Groq, Mistral,
Cerebras and the rest sit in the list doing nothing — not because they are bad
teammates, but because nothing ever hands them work.

On top of that, the old list of usable AIs only knows six names. Cerebras,
Together, GitHub Models, DeepSeek, Grok, Perplexity and Cohere are not in it at
all, so even a correct pick could not reach them.

And the suggestions favour paid AIs (ChatGPT, Claude, DeepSeek, Grok), which is
why it feels like there is no free teammate available.

## 1. Every saved key becomes a real teammate

The thinking stage stops asking the deleted picker and reads your own numbered
key list instead:

- Gemini watches the video (unchanged).
- The next keys in your order then think over what Gemini found.
- Up to two of them run per video, so it stays fast and cheap.
- A key that is out of tokens, switched off, or failing is skipped and the next
  number takes its place automatically.
- The mining log names each one: who ran, what it added, who was skipped and why.

Any provider in your list can do this, including the seven that were unreachable
before. Claude uses its own connection; everything else uses the standard one.

## 2. Free teammates, recommended first

Suggestions change so every creation type leads with free options, with paid ones
shown only as an optional upgrade:

- Learning / knowledge: Groq, Cerebras, Together
- Gaming: Groq, Cerebras (free), then DeepSeek as a paid upgrade
- Voice: Groq, Cerebras
- Sales: Groq, Together, then Grok as a paid upgrade
- Robot: Cerebras, Groq, then Claude as a paid upgrade

The "Suggested teammates" strip keeps its one-tap Add, and free entries are
labelled free so there is no surprise bill.

## 3. The team on one line

Above the numbered list, a single line shows who is working together right now:

```text
Your team:  Gemini + Groq + Cerebras          2 standing by
```

- Names joined with "+" in the order they are used.
- Only keys that are actually usable right now are in the line.
- Ones that are switched off, over the limit, or out of tokens are counted as
  "standing by" at the end instead of cluttering the line.
- Tapping the line scrolls to the list.

## Technical notes

- `src/lib/miner-reason.ts`: replace the `MinerChoice`-driven thinker selection in
  `runUnderstandingPass` with `rankedCredentials()` from `@/lib/key-manager`.
  Drop the `gemini` entries, take the first 2 remaining credentials, and call
  `thinkClaude` for `anthropic`, otherwise `thinkOpenAICompatible(provider,
  cred.baseUrl, cred.apiKey, cred.model, ...)`. Keep the merge/dedupe and the
  `ThinkerReport[]` shape; widen `ThinkerReport.id` from `MinerId` to `string`.
  Keep the `selfSufficient` early-exit only when the chain has no non-Gemini key.
- `src/components/guided-studio.tsx`: `runUnderstandingPass(rawMined, category,
  signal)` — the `choice`/`perVideo` override argument goes away; `minedByAi`
  becomes the first thinker from the reports (falling back to `gemini`).
- `src/lib/key-advice.ts`: rewrite `PICKS[*].recommended` to the free-first lists
  above; add an optional `paidUpgrade` id per category surfaced separately in the
  suggestions strip.
- `src/components/ai-keys-card.tsx`: new `TeamLine` above the rows built from
  `rows.filter(providerUsable)` joined with " + ", plus a standby count; add
  `teamLine`/`standby` copy in en/mn/ko.
- Verify with `bunx tsgo --noEmit` and a browser pass over `/creator` step 3.
