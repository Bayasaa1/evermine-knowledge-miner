# Subtitle language and live spoken translation

Two new controls inside the subtitle settings panel on a playing video, under the existing size / position / timing sliders.

## 1. Subtitle language

A language picker listing all 20 supported languages, plus "Original" (the mined text as spoken).

- Chosen per video, saved on the device, and independent of the app language button at the top. Changing the app language no longer changes what the subtitles say.
- Subtitles switch immediately: lines already translated appear instantly from the local cache, the rest arrive within about a second.
- The full line list of the video on screen is translated ahead of playback, so lines never lag behind the speech.

## 2. Voice language (live spoken translation)

A second picker in the same panel plus an on/off switch: "Speak this video".

- When on, each subtitle line is spoken in the chosen language in the creator's cloned voice as it appears, so the viewer hears the video in their own language.
- The video's original sound drops to a quiet background level while the voice speaks and comes back up between lines.
- Only available on videos belonging to a published Mind whose creator has built a voice. Otherwise the switch is disabled with the plain reason shown.
- Lines are spoken one at a time and skipped rather than queued when playback has moved on, so the voice never drifts behind the picture. Pause, mute, or scrolling to the next video stops it instantly.

## Which AI does the work, and how it is changed

Both features run on the API Manager, not on anything hard-wired:

- Subtitles use the **Translating** job. Whichever key is assigned there does the work, automatic switching included, so if that key runs out the next enabled key picks it up mid-video.
- Speaking uses the **Voice clone** job of the creator who owns the video (their ElevenLabs key, their voice, their cost) — the viewer is never charged and never sees the creator's key.
- Changing either engine is one tap in the API Manager: no setting inside the video panel names a provider, and the panel shows which engine spoke or translated last, with a link to change it.
- If the needed key is missing or exhausted, the panel says exactly that and links to the API Manager instead of silently showing the original language.

## Keeping it fast and cheap

- Translated lines are stored on the device per language, so a video watched again — or a phrase repeated across videos — is never paid for twice.
- Only the video on screen is translated, in one batched request, and only up to what will be spoken in the next stretch; scrolling away cancels the rest.
- Spoken audio is cached per line and language for the session, so rewinding does not re-bill the creator.
- Speaking is prepared one line ahead while the current line plays, so there is no silent gap; if preparation is late the line is skipped rather than played over the next one.
- The picture never waits on the AI: subtitles fall back to the original text and playback continues if a translation is slow.

## Wording

Both pickers use the viewer's language (English / Mongolian / Korean), with plain labels: "Subtitle language", "Spoken language", "Speak this video".

## Technical details

- `src/lib/i18n.ts`: add `useDisplayTextsIn(texts, lang)` / `useDisplayTextIn` — same cached path as `useDisplayTexts` but with an explicit target language; `dynamic-translate` already batches, caches and paces requests through the `translate` role.
- `src/routes/index.tsx` (`FeedCard`): new persisted state `subtitleLang` (`"source" | LangCode`), `voiceLang`, `speakOn`; cues rendered through `useDisplayTextsIn`; two `Select`s and a `Switch` appended to the existing `PopoverContent`.
- New `src/lib/live-dub.ts`: a client controller over the existing `startDub` in `src/lib/voice-dub.ts` — one active `DubHandle` at a time, keyed by cue index, with a one-line lookahead buffer, an in-session PCM cache keyed `mindId:lang:text`, and cancel on cue change / pause / unmount. Exposes `speaking` so the player ducks volume (YouTube `setVolume`, HTML5 `volume`) to ~20%.
- Availability and errors come from `/api/mind-voice`: `no_clone` (404) disables the switch with its message; `no_key` / quota responses surface the API Manager link. No device-voice substitution, since the user chose the cloned voice.
- No backend or schema change: translation goes through the existing `translateTexts` server function, speech through the existing `/api/mind-voice` route, both on real account keys.
