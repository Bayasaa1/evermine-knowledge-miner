# Make every app user's chosen AI actually run

This is not a special setup for the app owner. Every signed-in customer must be able to add their own keys, assign each usable AI to a job, and see that exact AI perform the real job.

Why users can "only pick Gemini" today:
- Translating, Core brain and Chatting already permit Groq / Mistral / OpenRouter in code, but that does not prove the real app flows use the selection successfully.
- Mining videos and Seeing on video calls are locked to Gemini in the app, because only Gemini can watch a video or an image.
- Voice clone only accepts ElevenLabs.

So three of the six rows really do show Gemini alone. That is the part worth changing.

## 1. Prove the real jobs first

Before adding more providers, test the existing six through the same screens and request shapes customers use—not tiny “OK” checks.

- Translation: assign each text-capable AI in turn and translate a real multi-line subtitle batch into Korean and Mongolian. Confirm the returned lines are different from the source and History names the selected provider.
- Core brain: assign each text-capable AI and run a real saved-mind audit plus a project knowledge update. Confirm the saved result and History provider.
- Chat: assign each text-capable AI and send a real Mind chat message using existing knowledge. Confirm the answer and History provider.
- Mining/video sight: test Gemini with a real short video chunk and image frame. Other text-only AIs must not be offered for the watching step.
- Voice clone: test ElevenLabs only when a customer has added it; otherwise show device voice as the fallback, not a successful clone.
- For every failed provider/role pair, keep the key visible and show the actual provider response. Do not mark it working and do not silently pass through another key during the selected-key test.
- Fix the app's translation flow until normal page text and subtitles visibly change after selecting Groq, Mistral, OpenRouter, or Gemini.

## 2. Never stop when a key runs out (most important)

Today, text jobs (translating, core brain, chat) do move to the next key when one hits its limit — but mining does not: it grabs one Gemini key at the start and the whole job stops when that key's daily quota ends.

- Mining will keep a list of your usable keys for the job instead of one. When the running key hits its limit, the next chunk continues on the next key, and the video finishes.
- The same for your spare Gemini keys: two Gemini keys means roughly double the daily mining.
- The switch is written into the job, so a paused job resumed later starts from the key that still has room.
- Each row shows plainly: "started on Gemini ···aAog, finished on Gemini ···awxg", never a silent swap.
- The "switch automatically" checkbox stays in charge: off means the job stops with the real reason instead of moving.

## 3. Split mining into "watch" and "write"


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

## 4. Make each engine's strength visible

Next to each choice, one short line about what that engine is good at, so picking is not guesswork:
- Groq — fastest free text. Best for translating and mining write-up.
- Mistral — good structured writing. Good for Core brain.
- OpenRouter — access to many models, some free, some paid; label each clearly.
- Gemini — the only one that can watch video and images.
- Cerebras / Together — currently used up; shown as such, not hidden.

Also add a one-tap "Spread the work" button that sets a sensible split for you:
watching = Gemini, write-up = Groq, translating = Groq, core brain = Mistral, chat = Gemini.

## 5. Better free options to add (answering "what about meta.ai")

Meta has no public AI API — meta.ai is a consumer chat site only. But Meta's Llama models are free through providers you can already add. Worth offering in the add-key list:
- NVIDIA NIM — free tier, hosts Llama and Qwen.
- Hugging Face Inference — free tier, many open models.
- GitHub Models — already supported in the app, free with a GitHub account, just not promoted.
- Groq and Cerebras — already supported; Groq is the strongest free choice.

Add NVIDIA and Hugging Face only after their real translation, Core brain, and chat calls pass. Surface GitHub Models in the suggestion list after the same proof.

## 6. Honesty rules kept

- A key is only shown as working after a real call of that exact job.
- Used-up or rejected keys stay visible with the real reason.
- No Lovable credit is used anywhere; every call runs on your own keys.
- Tests use a temporary test customer account and test keys; they do not spend or expose one customer's keys to another customer.

## Technical details

- Build a protected role-test matrix that runs the same prompt, model selection, parser and provider path as each real role; return provider, masked key, model, role, success/failure, and safe error.
- Translation verification must exercise `translateTexts` and the display cache, not only `generateRoleTextOnce`; verify a fresh page renders translated text and a subtitle batch stays translated after reload.
- Mining keeps a key list: `resolveGeminiCredential` gains a "skip these key ids" argument, and `miner-pool` / `mining-jobs` / `resume-mining` retry the current chunk on the next usable key on a quota error, saving the new key id onto the job row.
- `ROLE_PROVIDERS` gains `mine_write` (all text providers) while `mine` stays Gemini-only; `AI_ROLES`, `ROLE_COPY` (EN/MN/KO) and the role-check server functions extend with it.
- `miner-pool` / `youtube-mine.server` / `mining-jobs` call `generateRoleText("mine_write", ...)` for the summarise/extract pass, falling back to Gemini when that key errors.
- `OPENAI_COMPATIBLE` gains `nvidia` (`https://integrate.api.nvidia.com/v1`) and `huggingface` (`https://router.huggingface.co/v1`); provider enum, labels and rates updated.
- Role card shows a per-provider strength hint and a "Spread the work" action that writes five `user_ai_roles` rows in one go.

## Completion gate

Do not call this complete until the tested customer can choose Groq for translation, Mistral for Core brain, Gemini for watching/mining, and another usable provider for chat—and the real outputs plus History prove those exact choices ran. Any provider blocked by its own quota or account remains clearly failed, not described as an app success.
