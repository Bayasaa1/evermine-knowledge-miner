# Subtitle language and live spoken translation

Two new controls inside the subtitle settings panel on a playing video, under the existing size / position / timing sliders.

## 1. Subtitle language

A language picker listing all 20 supported languages, plus "Original" (the mined text as spoken).

- Chosen per video, saved on the device, and independent of the app language button at the top of the page. Changing the app language no longer changes what the subtitles say.
- Subtitles switch to the chosen language immediately; already-translated lines appear instantly from the local cache, the rest arrive within a second.
- The whole line list of the video on screen is translated ahead of playback, so lines never lag behind the speech.

## 2. Voice language (live spoken translation)

A second picker in the same panel plus an on/off switch: "Speak this video".

- When on, each subtitle line is spoken in the chosen language in the creator's cloned voice as it comes up on screen, so the viewer hears the video in their own language.
- The video's original sound is lowered to a quiet background level while the voice speaks and comes back up between lines.
- Only available on videos that belong to a published Mind with a cloned voice. On other videos the switch is shown disabled with the reason ("This creator has not built a voice yet").
- Speaking uses the viewer's own AI key through the existing voice job, so the panel says plainly that it uses their own AI key, and if no key is set it points them to the API Manager instead of failing silently.
- Lines are spoken one at a time and skipped rather than queued if playback has already moved past them, so the voice never drifts behind the picture. Pausing, muting or scrolling to the next video stops the voice at once.

## Wording

Both pickers use the viewer's language (English / Mongolian / Korean) and plain labels: "Subtitle language", "Spoken language", "Speak this video".

## Technical details

- `src/lib/i18n.ts`: add `useDisplayTextsIn(texts, lang)` / `useDisplayTextIn` — the same cached translate path as `useDisplayTexts`, but with an explicit target language instead of the app language.
- `src/routes/index.tsx` (`FeedCard`): new state `subtitleLang` (`"source" | LangCode`) and `voiceLang` + `speakOn`, persisted in localStorage per device; subtitle cues rendered through `useDisplayTextsIn`. Two `Select` controls and one `Switch` appended to the existing `PopoverContent`.
- Live voice: new small hook `useLiveDub` (client, `src/lib/live-dub.ts`) built on the existing `startDub` from `src/lib/voice-dub.ts` — takes `mindId`, the active translated cue, `voiceLang`, and the persona `voiceId`; keeps one active `DubHandle`, stops it on cue change / pause / unmount, and reports "speaking" so the player can duck the video volume (YouTube player `setVolume`, HTML5 `volume`) to ~20% while speaking.
- Availability: gated on `item.mindId` plus a cloned voice; reuse the existing `no_clone` signal from `/api/mind-voice` to show the disabled reason instead of the device-voice fallback.
- No backend or schema change: translation uses the existing `translateTexts` role, speech uses the existing `/api/mind-voice` route, both on the viewer's own keys.
