# One person on the other side: real voice clone, real face, one live mind

You are right, and this is the part I have to be straight with you about.

Cloning someone's actual voice is not text-to-speech. A clone is built by feeding a voice-cloning engine clean samples of the creator's real speech — which we already mine out of their videos — and getting back a voice model that sounds like *them*, with their accent, rhythm and breath. No general chat AI can do that, and no browser voice can do that. It needs a cloning engine.

Same for the face: a real face clone drives their actual mined face — eyes, brows, jaw, head motion — off the audio, frame by frame, in real time. That is a different engine again.

And the third thing you said is the hardest and the most important: **the three must feel like one person.** The thinking, the voice and the face cannot each take their turn. They have to overlap.

## How the three become one, with no delay

The trick is that nothing waits for the step before it to finish:

```text
you speak ──► words appear as you talk (live, not after you stop)
                  │
                  ▼
            mind starts thinking on the first words
                  │  answer streams out word by word
                  ▼
            voice clone speaks each phrase the moment it exists
                  │  audio streams out
                  ▼
            face is driven by that same audio as it plays
```

- The Mind starts answering before you finish your sentence, and the answer streams out in pieces.
- Each finished phrase goes straight to the voice clone and starts playing — we never wait for the whole answer.
- The face is driven by the audio that is already playing, so lips and expression are locked to the voice by construction, never "synced afterwards".
- It can start with a breath or a filler in their own style ("hmm—") so the gap is filled the way a real person fills it.

Target: under a second from you finishing a sentence to hearing their voice start.

## What is free and what needs a key — honestly

The free path must always work, so:

| | Free path (no key from anyone) | Full clone |
| --- | --- | --- |
| Thinking | Built-in Gemini the app already uses | Creator's own key if they want more quota |
| Voice | Their mined **real audio** is replayed where it fits, plus the best voice the browser has for the rest — clearly labelled "not the real clone yet" | A cloning engine trained on their mined samples: their true voice, any words, any language |
| Face | Their mined face as a living portrait, driven by the audio (eyes, brows, jaw, head motion, mined emotions) | A real-time face engine driving the same mined face photoreally |

I will not dress the free version up as a clone. It says plainly: "Voice clone not enabled — this is a stand-in." One button turns the real one on.

Important: turning the real clone on does **not** have to cost the creator money. The cloning engines have free tiers — the creator makes a free account, pastes the key once, and the Mind speaks in their real voice within that free allowance. Paying only buys more minutes.

## Consent, because this is someone's voice and face

A persona can only be cloned by its owner. Before a clone is created the owner confirms it is their own voice and face, and that confirmation is stored with the persona. Any Mind speaking with a cloned voice carries an "AI clone" marker.

## Setting it up (the creator sees this once)

Persona → **Voice & Face**:
1. Evermind picks the cleanest speech samples out of the already-mined videos and shows them — the creator can drop bad ones.
2. Pick the cloning engine, paste the free-tier key, press **Create clone**. It takes a minute.
3. **Hear it** — the clone reads a sentence back. Not right? Change samples and rebuild.
4. Same for the face: pick the best face shots from the mined video, build, preview a talking clip.
5. Done — chat, voice call, video call and the game bot all use it from that moment.

## Any language, still their voice

Yes — this works. A voice clone carries the *timbre* of the person, not their language. So when you switch Evermind to Mongolian, Technoblade thinks in his mined brain and answers you in Mongolian **in his own voice**; CTS answers in English in his. One honest limit: he will sound like Technoblade speaking Mongolian — his own accent — not like a native Mongolian speaker. That needs a multilingual cloning engine, which the setup step below requires.

The face follows automatically, because it is driven by whatever audio is playing, in whatever language.

## Video call: it sees you too


Camera stills every few seconds go to the Mind, so it reacts to your mood, gestures and surroundings — "you look tired", "show me that again". Frames are analysed and dropped, never stored. Clear notice at call start and a camera-off switch you control.

## The gaming teammate speaks in the same voice

The in-game teammate uses the exact same runtime: it reports what is happening (health, mobs, your chat), the Mind decides an action and a line, and the line is spoken in the creator's cloned voice while a fast local layer handles fighting, following, mining and building instantly.

## Technical notes

- `src/lib/mind-runtime.server.ts` (new): one brain loader + prompt builder shared by chat, voice, video, coach and game. Prompt building moves out of `api/mind-chat.ts`.
- **Pipeline is streamed end to end**: browser speech recognition emits interim text → the runtime streams the model answer → a sentence splitter flushes each clause to the voice engine → `src/lib/voice-dub.ts` plays the arriving audio and already emits a live viseme value from the waveform, which drives the face. No stage waits for the previous stage to complete.
- `persona_voices` / `persona_faces` tables (owner-only RLS + grants): sample references, engine id, remote clone/voice id, consent flag, build status. Engine keys live as backend secrets, never returned to the browser.
- Sample selection reuses mined audio segments (`mining-audio.ts`, timeline segments) and the mined face frames already stored with the vault — no new upload step.
- Voice: `api/mind-voice` gains an engine switch (cloning engine → mined-audio + browser voice fallback), always streaming, never a buffered request; fallback is automatic and labelled in the UI.
- Face: `src/components/mind-avatar.tsx` (new) — canvas portrait driven by the existing viseme stream and `emotionStyle`; the real-time face engine swaps in behind the same component so the rest of the app does not change.
- Video call: `talk-to-mind-modal.tsx` gains caller camera capture (`getUserMedia`), one JPEG every ~4s to a new `api/mind-vision`, in-memory only, rate-limited via `guardApi` like the coach route.
- Game: generated bot in `src/lib/game-bot.ts` posts compact world state to a token-protected `api/public/v1/mind/$token/act` returning `{say, action, params}`; reflex behaviours stay local via pathfinder; spoken lines reuse the cloned voice.
- Copy in en / mn / ko.

## Order

1. Streaming runtime — chat, voice and face on one non-blocking pipeline (this is what kills the delay).
2. Real voice cloning: sample picking, consent, build, preview, live use, honest fallback.
3. Real face cloning on the same audio stream.
4. Video call that sees you.
5. Game teammate on the same voice and brain.
