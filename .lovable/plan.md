# Rebuild the Miner Around a Real Timeline

## The core problem

Right now every timestamp in a mined video is *invented by the AI*. The model watches a 5-minute block and is asked to also write down the clock time of each line. It guesses, so subtitles land near the right moment at best and at 0:00 at worst. Everything else that depends on time — face clips, voice clips, emotion curve, story beats, movement windows — inherits the same guess.

Patching the player or re-spreading lines afterwards cannot fix this. The miner needs a real clock first, and the AI should describe the video against that clock instead of inventing it.

## 1. Get a real spoken timeline first

Before any analysis, build a word/line timeline with true times:

- Primary source: the video's own caption track from YouTube (both human and auto-generated). It carries exact start/end times per line, in the original spoken language, and costs nothing.
- Fallback when a video has no caption track: transcribe the audio with the built-in speech-to-text engine in short windows and keep the returned segment times.
- Last resort (no captions, no usable audio): keep today's estimate path, but mark the video as "estimated timing" so it is visible instead of silently wrong.

This timeline becomes the single source of truth for time in the whole Mind.

## 2. Make the analysis describe, not guess

- Keep the AI as the meaning layer: story, emotion, topics, movement, strategy, persona traits, cultural phrases.
- Feed it the timed transcript alongside the video, and require every timed item to reference a line/segment id from that timeline rather than writing a raw clock value.
- Shrink analysis windows from 5 minutes to ~90 seconds for time-sensitive parts (faces, movement, emotion), which sharply reduces drift; keep the 5-minute pass for the big-picture story so cost stays similar.
- Resolve every referenced id back to true seconds after the model answers. Anything the model cannot anchor is dropped or flagged — never defaulted to 0:00.

## 3. Define what each part of the app actually needs

Each consumer gets an explicit, validated shape so mining is judged against a requirement, not vibes:

- Subtitles: verbatim line, original language, true start and end, speaker label, max ~7 words per cue.
- Story: chronological summary plus ordered beats with anchored times, tone per beat.
- Voice clone: clean, music-free speech windows of 5-15s with true boundaries, speaker, quality score, noise/music flags.
- Face clone: keyframes and 2-8s action clips with true boundaries, angle, lighting, gesture, usability score.
- Movement: named physical actions with tight true windows and a short technique description.
- Emotions: a continuous timeline of segments with emotion, intensity and trigger — anchored to speech lines.
- Core brain: concepts, skills, beliefs, decision logic, cultural phrases, each with the evidence line it came from.
- Strategy/gaming: skills, tactics, decisions, tutorials, communication and emotional reactions, all anchored.
- Topics: ranked topics with the time ranges that support them.

## 4. Quality gate and repair

- After each video, score the result: percentage of lines with true timing, coverage of the video's duration, number of dropped/unanchored items.
- Show that score in My Vaults next to each video, with a plain explanation ("timing from the video's own captions" vs "estimated").
- Free repair for already-mined videos: pull the caption track now and re-anchor existing transcripts and clips to it, without spending mining credits or re-watching the video. Videos with no captions can be re-anchored with the speech engine on request.

## Technical details

- New server module fetches the caption track via the existing InnerTube path (`captionTracks` from the player response) and parses it to `{ start, end, text }`.
- Speech-to-text fallback goes through the built-in AI transcription endpoint, server-side, in chunks, and reuses the returned segment times.
- `ChunkResult` gains a `timeline` array; timed fields carry `lineRef` (or explicit true seconds) and are resolved in `merge-results.ts` instead of `wholeVideoStamp` guesswork.
- Schema in `gemini.ts` switches time-critical fields from free-text stamps to timeline references; validation rejects unanchored entries.
- `subtitle-health.ts` reports the new score; `repair-timings.ts` gains the caption-based re-anchor path and stays as the estimate-only fallback.
- Applies to all miners in the pool: perception (caption/ASR + visual) runs once, and text-only providers reason over the anchored brief.

## Validation

- Re-anchor the existing CTS and Gremix videos for free and confirm captions track the speech within about a second on both mobile and desktop.
- Confirm the timing score reads "from captions" for videos that have them and "estimated" for those that do not.
- Mine one new video end to end and confirm subtitles, story beats, voice clips, face clips, emotions and topics all point at moments that actually contain what they claim.
