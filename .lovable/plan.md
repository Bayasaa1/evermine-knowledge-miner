# Put all six of your keys to work

Your account now really holds six keys: Gemini ···aAog, Groq ···JGwY, Mistral ···ert8, OpenRouter ···9e30, Together ···8190 (used up), Cerebras ···hed3 (used up). Every job is still pointed at Gemini.

Why you can "only pick Gemini" today:
- Translating, Core brain and Chatting already accept Groq / Mistral / OpenRouter — but every one of them is currently set to Gemini, so nothing else is being used.
- Mining videos and Seeing on video calls are locked to Gemini in the app, because only Gemini can watch a video or an image.
- Voice clone only accepts ElevenLabs.

So three of the six rows really do show Gemini alone. That is the part worth changing.

## 1. Split mining into "watch" and "write"

Mining is two different jobs glued together. Only the first needs eyes.

```text
video -> [WATCH]  Gemini: what is on screen, what is said   -> raw notes
      -> [WRITE]  any text engine: clean up, summarise,     -> knowledge
                  pull out facts, steps, concepts
```

- Add a second mining choice: "Mining — writing up" that accepts Groq, Mistral, OpenRouter, Cerebras, Together, and the rest.
- Gemini keeps "Mining — watching" (unchanged, still the only one offered there).
- Result: Gemini's free quota is spent only on watching, which roughly doubles how many videos you can mine in a day, and Groq does the heavy text work for free and much faster.
- If the write-up engine fails, the watching engine finishes the job as it does today, and the row says so.

## 2. Make each engine's strength visible

Next to each choice, one short line about what that engine is good at, so picking is not guesswork:
- Groq — fastest free text. Best for translating and mining write-up.
- Mistral — good structured writing. Good for Core brain.
- OpenRouter — access to many models, some free, some paid; label each clearly.
- Gemini — the only one that can watch video and images.
- Cerebras / Together — currently used up; shown as such, not hidden.

Also add a one-tap "Spread the work" button that sets a sensible split for you:
watching = Gemini, write-up = Groq, translating = Groq, core brain = Mistral, chat = Gemini.

## 3. Better free options to add (answering "what about meta.ai")

Meta has no public AI API — meta.ai is a consumer chat site only. But Meta's Llama models are free through providers you can already add. Worth offering in the add-key list:
- NVIDIA NIM — free tier, hosts Llama and Qwen.
- Hugging Face Inference — free tier, many open models.
- GitHub Models — already supported in the app, free with a GitHub account, just not promoted.
- Groq and Cerebras — already supported; Groq is the strongest free choice.

I will add NVIDIA and Hugging Face as choices, and surface GitHub Models in the suggestion list.

## 4. Honesty rules kept

- A key is only shown as working after a real call of that exact job.
- Used-up or rejected keys stay visible with the real reason.
- No Lovable credit is used anywhere; every call runs on your own keys.

## Technical details

- `ROLE_PROVIDERS` gains `mine_write` (all text providers) while `mine` stays Gemini-only; `AI_ROLES`, `ROLE_COPY` (EN/MN/KO) and the role-check server functions extend with it.
- `miner-pool` / `youtube-mine.server` / `mining-jobs` call `generateRoleText("mine_write", ...)` for the summarise/extract pass, falling back to Gemini when that key errors.
- `OPENAI_COMPATIBLE` gains `nvidia` (`https://integrate.api.nvidia.com/v1`) and `huggingface` (`https://router.huggingface.co/v1`); provider enum, labels and rates updated.
- Role card shows a per-provider strength hint and a "Spread the work" action that writes five `user_ai_roles` rows in one go.

## Your point 3

Your message stopped at "3," — tell me what it was and I'll fold it in.
