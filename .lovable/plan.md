# Match each AI to what it can actually mine

You are right. The four creation types need different senses, so the AI list in step 3 should change depending on what the creator is building — and an AI that cannot see the video must not be offered for a Robot Brain.

## The rule per creation type

| Creation type | What mining needs | AIs allowed |
|---|---|---|
| AI Assistant / Knowledge Mind | words only | all of them |
| Robot Brain / Embodied VLA | must watch the footage (movement, grasp, space) | vision AIs only |
| Voice Calling Agent | must hear the audio (tone, pace, voice print) | audio-capable AIs, plus text AIs for the script layer |
| Product & Service Sales Mind | words, plus product shots if available | all; vision AIs get a richer result |

## The pool: 3 free, 4 paid, 1 manual

Free tier
- Gemini — sees video and hears audio. Default, and the only free one able to do Robot Brain and Voice.
- Groq — text only, extremely fast.
- Mistral — text only, free tier.

Paid
- ChatGPT — text, plus image and audio understanding.
- Claude — text and images, deepest reasoning.
- Kimi — text, very long videos in one pass.
- OpenRouter — one key, many models; capability follows the model chosen.

Manual
- Add your own AI — the creator declares what it can handle (text / images / audio / video) so the same rules apply to it.

## What the creator sees

- Step 3 lists every AI, but any AI that cannot do the selected creation type appears locked, greyed, with a plain reason: "Groq cannot watch video, so it cannot build a Robot Brain."
- Locked AIs cannot be selected, so Start mining can never begin an impossible job.
- The "What you can mine" panel already reacts to the chosen AI; it will also state what this AI contributes to *this* creation type.
- If a creator picks a text-only AI for a type that partly needs sight or sound, the panel says exactly what will be missing.

## How mining actually uses the choice

Today the choice is saved but every job still runs on Gemini. This changes to two stages:

1. Sight and sound pass — Gemini reads the footage and produces transcript, timestamps, faces, emotion and voice segments. Always runs when the type needs it.
2. Understanding pass — the AI the creator picked turns that material into the schema for their creation type (knowledge, robot, voice or sales).

For a text-only AI on a Knowledge or Sales mind, stage 1 shrinks to transcript extraction only, so the creator's free Groq or Mistral key genuinely does the work.

## Technical notes

- Add a `modalities` field (`text` / `image` / `audio` / `video`) and a `supports: CreationCategory[]` derivation to each entry in `src/lib/miner-pool.ts`; add the same declaration to the custom-AI form.
- `minerReadiness()` gains a category argument so a card is Ready only when it has a key *and* fits the current creation type.
- `src/components/miner-pool.tsx` renders locked cards with the reason; `src/components/guided-studio.tsx` passes the active creation category in and blocks Start mining on a locked pick.
- Mining pipeline (`src/lib/gemini.ts`, `src/lib/mine-file.ts` and the mining server functions) splits into the extraction stage and a provider-routed reasoning stage that calls the selected provider with the creator's stored key, falling back to the built-in engine when no key exists.
