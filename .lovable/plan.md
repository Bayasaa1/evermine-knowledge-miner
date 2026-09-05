# Give every creation type its own pool of 8 AIs

You are right: Groq cannot watch a video, so it can never build a Robot Brain. The fix is one catalog where every AI declares what it can perceive, and each of the 4 creation types offers its own pool of exactly 8 options: **3 free, 4 paid, 1 manual (add your own)** — with only AIs whose senses can do the job.

## The pools per creation type

**AI Assistant / Knowledge Mind** (words only — every AI qualifies)
- Free: Gemini (default), Groq, Mistral
- Paid: ChatGPT, Claude, Kimi, OpenRouter
- Manual: add your own AI

**Robot Brain / Embodied VLA** (must SEE the footage)
- Free: Gemini (default), Qwen-VL via OpenRouter free tier, LLaVA-style vision via OpenRouter free tier
- Paid: ChatGPT (vision), Claude (vision), Gemini paid key, OpenRouter paid vision models
- Manual: add your own AI (declared as vision-capable)

**Voice Calling Agent** (must HEAR the audio)
- Free: Gemini (default), Whisper-compatible via OpenRouter free tier, Groq Whisper
- Paid: ChatGPT (audio), Gemini paid key, OpenRouter audio models, ElevenLabs-style voice service
- Manual: add your own AI (declared as audio-capable)

**Product & Service Sales Mind** (words, bonus from images)
- Free: Gemini (default), Groq, Mistral
- Paid: ChatGPT, Claude, Kimi, OpenRouter
- Manual: add your own AI

## How it works

- One catalog in `src/lib/miner-pool.ts`: every AI entry declares its senses — text / image / audio / video.
- Each creation type maps to required senses: knowledge → text; robot → video; voice → audio; sales → text (+image bonus).
- Step 3 receives the active creation type and lists only the 8 matching options, grouped free → paid → manual. Text-only AIs never appear for Robot Brain at all, so an impossible job can't be started.
- The manual "add your own AI" form asks the creator to tick what their AI can handle (text / image / audio / video); it then joins the pools that match.
- The "What you can mine" panel stays per-AI and also states what that AI produces for the current creation type, and what it cannot.

## How mining uses the choice (this answers the blind-AI problem)

A blind AI never touches the footage. Mining always runs in two stages:

1. **Sight and sound pass — always the built-in Gemini engine**, regardless of the picked AI. It watches the video and produces the raw senses as text: transcript with timestamps, face and movement descriptions, emotion readings, voice segments. This stage is free for the creator and needs no key.
2. **Understanding pass — the AI the creator picked.** It receives stage 1's text material and turns it into the final schema for the creation type (knowledge, robot, voice or sales), using the creator's stored key, falling back to the built-in engine when no key exists.

So Groq can build a Knowledge Mind: Gemini sees the video, extracts emotion and movement notes as text, and Groq does the reasoning. What Groq still cannot do is the Robot Brain — trajectories and 3D grasp need a vision model doing the *analysis*, not just the extraction — which is why only vision AIs appear in that pool.

For Knowledge and Sales minds, stage 2 is where the picked AI genuinely works. For Robot and Voice, the picked vision/audio AI is involved in both stages.

## Technical notes

- `src/lib/miner-pool.ts`: add `senses: ("text"|"image"|"audio"|"video")[]` per entry; add the new providers (OpenRouter vision/audio free-tier variants, Groq Whisper); add `minersForCategory(category)` returning exactly the 8-option pool; extend `MinerChoice.custom` with a senses declaration.
- `src/components/miner-pool.tsx`: render the filtered pool with free/paid/manual grouping; keep ready/needs-key badges and per-AI test buttons.
- `src/components/guided-studio.tsx`: pass the active creation category into the pool; Start mining requires a ready pick from that pool.
- Mining pipeline (`src/lib/gemini.ts`, `src/lib/mine-file.ts`, mining server functions): split extraction from provider-routed reasoning, route stage 2 to the selected provider with the stored key, built-in fallback preserved.
- Copy for all new cards and reasons in en / mn / ko.
