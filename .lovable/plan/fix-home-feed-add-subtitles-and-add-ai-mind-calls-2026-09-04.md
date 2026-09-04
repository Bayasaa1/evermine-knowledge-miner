# Fix Home Feed, Add Subtitles, and Add AI Mind Calls

## Goal
Make creator videos load correctly on the first visit to Home, surface mined subtitles in Vaults and the News Feed, and add voice/video AI Mind calls directly inside the existing chat experience.

## 1. Fix the Home feed on direct entry

- Remove the fake marketplace list as the query’s visible fallback. Show a proper loading state until the public creator-content request completes, then render creator videos first.
- Fix the startup auth/cache race: the root auth bootstrap currently clears the entire React Query cache after the public Home query has already returned successfully. Preserve public queries during signed-out initialization while still clearing all user-private cached data on logout or account switching.
- Stop silently converting feed request failures into an empty creator list; expose an error/retry state so a failed request cannot look like “only fake videos exist.”
- Keep realtime invalidation for published projects/content, and explicitly refetch Home after relevant auth transitions without requiring Search → Home navigation.
- Verify with a fresh browser context opened directly at `/`, including signed-out and signed-in startup. The first rendered feed must include the current CTS and gremix creator videos without any navigation workaround.

## 2. Persist and display mined subtitles

- Add a `transcript` JSON column to `project_content` with an empty-array default, retaining the existing owner/public visibility rules.
- Normalize transcript entries into a stable shape containing playback seconds, speech, speaker, and role.
- Update the mining completion path so the already-extracted transcript is written to the associated project content together with timeline and emotion data.
- Backfill existing published content from its matching Mind Vault payload so the current mined CTS and gremix videos receive their existing 21-line and 77-line transcripts rather than requiring re-mining.
- Extend project/feed types and queries to include subtitles.
- News Feed: show a readable, time-synchronized subtitle overlay driven by YouTube/current video playback time, with a captions on/off control and responsive safe-area placement.
- Vaults: add subtitle availability/count to each mined video and an expandable transcript view with timestamps and speaker labels; clicking a timestamp seeks the associated video preview.
- Keep verbatim subtitle text in its mined/original language; do not run it through UI translation because translation would change what was actually spoken.

## 3. Add Voice Call and Video Call to chat

- Add Voice Call and Video Call controls to `TalkToMindModal`, reusing the existing Mind chat, speech recognition, cloned-voice streaming, emotion inference, and waveform-driven lip-sync systems already present elsewhere in the app.
- Voice Call mode:
  - request microphone permission only after the user taps the call button;
  - transcribe speech in the selected app language;
  - send the full current conversation history to the Mind;
  - speak replies through the existing Mind voice endpoint;
  - support mute/listen, interrupt, retry, and end-call states.
- Video Call mode:
  - present the AI Mind as a camera-style avatar using the creator image/cover;
  - animate mouth and emotional state from the existing audio waveform and emotion engine;
  - fall back automatically to voice-only when bandwidth or rendering support is limited.
- Move the existing call logic into shared focused components/hooks so Search/Explore and News Feed chat use the same implementation rather than maintaining two call systems.
- Resolve creator-project Minds server-side from the published project’s scoped Vault payload, so calls work for newly mined creator videos as well as built-in marketplace Minds without exposing raw private Mind JSON to the browser.
- Preserve authentication, rate limits, end-call cleanup, and clear microphone/AI-service error states.

## Technical details

- Apply the subtitle schema/backfill as one reviewed database migration.
- Keep public feed reads limited to `VISUAL_CONTENT` whose parent project is published; all Vault editing remains owner-scoped.
- Use existing React Query keys and invalidate `home-feed`, project content, and relevant Vault queries after mining or subtitle updates.
- Use the existing YouTube player time callback for subtitle synchronization and add a seek API for Vault transcript navigation.
- No live human/WebRTC calling is included; “Voice Call” and “Video Call” both connect to the selected AI Mind.

## Validation

- Fresh-load `/` and confirm creator content appears immediately with no Search/Home clicks.
- Confirm loading, request failure/retry, realtime publish, logout, and account-switch behavior.
- Confirm old and newly mined videos show correctly timed subtitles in both Vaults and News Feed on mobile and desktop.
- Test chat → voice call → interruption → end call, then chat → video call → avatar lip-sync → voice-only fallback.
- Verify no microphone/audio stream, speech recognizer, animation loop, or AI request remains active after closing the modal or ending a call.
