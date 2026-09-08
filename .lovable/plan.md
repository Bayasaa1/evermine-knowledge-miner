# Living Minds: free chat, voice calls, video calls and a teammate that really plays

Short answer to your question: the mined file is the memory, not the mind. It holds what the person knows, how they talk, how they look and how they sound. A thinking AI reads that memory every time someone speaks to it, and separate engines give it a voice and a face. This plan wires those three layers together, and the same brain is what the game bot carries in.

**Rule for everything below: the free path always works.** Nobody needs to paste a key to chat, call or play. Keys are only an optional upgrade for higher realism.

```text
              MEMORY (mined file)          THINKER (AI)            BODY
chat      →  beliefs, story, quotes   →   free built-in    →   text
voice call→  + voice print            →   free built-in    →   free voice (upgrade: real clone)
video call→  + face, emotions         →   free built-in    →   free avatar (upgrade: photoreal)
game      →  + skills, tactics        →   free built-in    →   Minecraft teammate
```

## 1. One brain, four bodies

Chat, coach and voice each build their own prompt in their own place today. They get merged into a single Mind Runtime: one place that loads the persona's mined memory (beliefs, decision logic, story, quotes, cultural phrases, gameplay skills, emotions) and hands it to the thinking AI. Chat, voice call, video call and the game bot all speak through it, so the personality never differs between them.

Complex questions are answered by the AI reasoning over that memory — exactly as chat does now — never by the file alone.

## 2. Free / upgrade for each part

| Part | Free (default, no key) | Optional upgrade (creator's key) |
| --- | --- | --- |
| Thinking | Built-in Evermind AI | Creator's own Gemini / OpenAI / Claude / Groq key |
| Speaking | Built-in voice, tuned per persona from mined samples | Real cloned voice service |
| Face | Animated mined-face portrait with lip-sync and emotions | Photoreal talking-head service |
| Seeing you | Built-in vision reads camera stills | Same, on the creator's own key |
| Game bot | Built-in AI drives talking and decisions | Creator's key for faster/longer sessions |

If a paid service fails, errors or runs out, it silently drops back to the free path — a call never goes silent and a chat never dies.

## 3. Adding a key (only if you want to)

A single **Engines** panel per persona, in plain language: pick who thinks, who speaks, who shows the face. Each row shows "Free — ready" by default. Choosing a paid option reveals a paste-your-key field with a link to get one, a short guide, and a **Test** button that plays a sample voice or generates one frame so you know it works before saving. Keys are stored server-side and never shown back in the browser.

## 4. Voice call

Speak, the Mind hears you, thinks and answers aloud in its own voice. Free voice is on by default. Live caption of what it said, mute, and end-call controls; existing lip-sync data drives the avatar.

## 5. Video call where the Mind sees you

Free avatar: the mined face becomes a living portrait — lips synced to the spoken audio, expressions from the mined emotion records.

The app takes a still from the caller's camera every few seconds (not a continuous stream — that keeps it free-tier friendly) and the Mind reads mood, gestures and setting and reacts: "you look tired", "nice setup", "show me that again". Frames are analysed and dropped, never stored. The call opens with a clear notice and a camera-off switch the caller controls at any time.

## 6. Gaming teammate that reacts, talks, teaches and fights

The downloadable teammate keeps playing through the game itself (no screen capture), but gets a live brain:

- **Fast reflex layer, on your PC:** follow, mine, build, block, attack, retreat, heal, feed you food. Instant, costs nothing.
- **Live AI layer:** every few seconds — and immediately on trigger events (your health drops, you say "help", a mob swarms, you die, you ask "how do I…") — the bot sends a short situation report to the Mind and gets back both an action and a line of speech in the player's own voice: "I'm coming, get behind the pillar", "don't trade there, block up first".
- **Teaching:** ask in game chat and it explains its tactic step by step, then tells you whether you did it right.
- Cool-downs and a per-session budget cap so a long play session stays inside the free allowance.

## 7. What it costs you

Live conversations and game sessions run on the free built-in engine unless the creator attached their own key. Each persona shows a simple meter: sessions today, calls used, remaining, and — for anyone who added a paid service — what it is costing.

## Technical notes

- `src/lib/mind-runtime.server.ts` (new): single brain loader + prompt builder shared by `api/mind-chat`, `api/mind-voice`, `api/mind-coach` and new `api/mind-vision` (caller-frame reading) and `api/game-brain` (bot decisions). Existing `mind-chat.ts` prompt building moves here.
- Engine resolution order, per call: persona's paid service → persona's own provider key → Lovable AI Gateway built-in (always available, no user key). Never throws "no key" at a caller.
- New `persona_engines` table (owner-only RLS + grants) holding thinker provider/model plus optional voice/avatar service references; secrets stored as backend secrets, never returned to the browser.
- Voice: `src/lib/voice-dub.ts` keeps its streaming/viseme contract; `api/mind-voice` gains a provider switch with automatic fallback to the built-in voice.
- Face: `src/components/mind-avatar.tsx` (new) — canvas portrait driven by existing `emotionStyle` plus the viseme value `startDub` already emits; the paid path swaps in a video stream behind the same component.
- Video call: `talk-to-mind-modal.tsx` gains caller camera capture (`getUserMedia`), one JPEG every ~4s to `api/mind-vision`, in-memory only, `guardApi` rate-limited like the coach route.
- Game: generated script in `src/lib/game-bot.ts` gains an event-driven brain loop posting compact world state (health, hostiles, position, inventory, chat) to a token-protected `api/public/v1/mind/$token/act` returning `{say, action, params}`; reflex behaviours stay local via pathfinder. Per-token rate limit and session budget enforced server-side.
- All new copy in en / mn / ko.

## Suggested order

1. Mind Runtime + Engines panel with free defaults (chat behaviour unchanged, one brain underneath).
2. Voice call on the free voice, with upgrade path and fallback.
3. Face avatar + video call that sees you.
4. Game brain loop for the teammate.
