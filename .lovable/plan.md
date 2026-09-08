# Living Minds: chat, voice, video calls and a teammate that really plays

Short answer to your question: the mined file is the memory, not the mind. It holds what the person knows, how they talk, how they look and how they sound. A thinking AI reads that memory every time someone speaks to it, and separate engines give it a voice and a face. This plan wires those three layers together properly, and the same brain is what the game bot carries in.

```text
              MEMORY (mined file)          THINKER (AI)            BODY
chat      →  beliefs, story, quotes   →   creator's AI    →   text
voice call→  + voice print            →   creator's AI    →   voice engine
video call→  + face, emotions         →   creator's AI    →   voice + face avatar (and it sees you)
game      →  + skills, tactics        →   creator's AI    →   Minecraft teammate
```

## 1. One brain, four bodies

Today chat, coach and voice each build their own prompt in their own place. They get merged into a single Mind Runtime: one place that loads the persona's mined memory (beliefs, decision logic, story, quotes, cultural phrases, gameplay skills, emotions) and hands it to whichever AI the creator picked. Chat, voice call, video call and the game bot all speak through it, so the personality never differs between them.

Complex questions are answered by the AI reasoning over that memory — exactly as chat does now — never by the file alone.

## 2. Voice: free by default, real clone as upgrade

- **Free (default):** the built-in voice already in the app, tuned per persona from the mined voice samples (pitch, pace, emotion). Works with no keys.
- **Upgrade:** the creator attaches a specialist voice service (ElevenLabs and similar) to a persona, pastes their key once, and gets their true cloned voice on every call. A test button plays a sample before saving.
- Falls back to the free voice automatically if the paid service errors or runs out, so calls never go silent.

## 3. Face: animated avatar now, photoreal as upgrade

- **Free:** the mined face becomes a living portrait — lip-synced to the spoken audio (already possible from the voice waveform) with expressions driven by the mined emotion records.
- **Upgrade:** the creator attaches a video-avatar service for a photoreal talking head. Same key flow and same fallback.

## 4. Video call where the Mind sees you

During a video call the app takes a still from the caller's camera every few seconds (not a continuous stream — that keeps it affordable), and the Mind reads mood, gestures and setting and reacts to them: "you look tired", "nice setup", "show me that again". Frames are analysed and dropped, never stored, and the call starts with a clear notice plus a camera-off switch the caller controls at any time.

## 5. Gaming teammate that reacts, talks, teaches and fights

The downloadable teammate keeps playing through the game itself (no screen capture), but gets a live brain:

- **Fast reflex layer, on your PC:** follow, mine, build, block, attack, retreat, heal, feed you food. Runs instantly, costs nothing.
- **Live AI layer:** every few seconds — and immediately on trigger events (your health drops, you say "help", a mob swarms, you die, you ask "how do I…") — the bot sends a short situation report to the Mind and gets back both an action and a line of speech in the player's own voice: "I'm coming, get behind the pillar", "don't trade there, block-up first".
- **Teaching:** ask in game chat and it explains its own tactic step by step, then calls out whether you did it right.
- Cool-downs and a per-session budget cap so an hour of play doesn't drain the creator's AI.

## 6. Who pays

Live conversations and game sessions run on the persona owner's connected AI, with the built-in engine as fallback. Each persona shows a simple live meter: sessions today, calls used, remaining, and what each add-on service costs — so a creator can see what a fan conversation actually costs them.

## Technical notes

- `src/lib/mind-runtime.server.ts` (new): single brain loader + prompt builder shared by `api/mind-chat`, `api/mind-voice`, `api/mind-coach` and a new `api/mind-vision` (caller-frame reading) and `api/game-brain` (bot decisions). Existing prompt-building in `mind-chat.ts` moves here unchanged in spirit.
- Persona-level engine config: new `persona_engines` table (owner-only RLS + grants) holding chosen thinker provider/model, optional voice-service and avatar-service keys stored as backend secrets, never returned to the browser. Reused by the runtime server-side only.
- Voice: `src/lib/voice-dub.ts` keeps its streaming/viseme contract; `api/mind-voice` gains a provider switch (built-in → paid clone) with automatic fallback.
- Face: `src/components/mind-avatar.tsx` (new) — canvas portrait driven by existing `emotionStyle` + the viseme value already emitted by `startDub`. Paid path swaps in the service's video stream behind the same component.
- Video call: `talk-to-mind-modal.tsx` gains caller camera capture (`getUserMedia`), one JPEG every ~4s to `api/mind-vision`, in-memory only, guarded and rate-limited via `guardApi` like the coach route.
- Game: `src/lib/game-bot.ts` generated script gains an event-driven brain loop posting compact world state (health, hostiles, position, inventory, chat) to a token-protected `api/public/v1/mind/$token/act`, returning `{say, action, params}`; reflex behaviours stay local via pathfinder. Per-token rate limit and session budget enforced server-side.
- All new copy in en / mn / ko.

## Suggested order

1. Mind Runtime + persona engine settings (chat unchanged in behaviour, one brain underneath).
2. Voice upgrade path with fallback.
3. Face avatar + video call that sees you.
4. Game brain loop for the teammate.
