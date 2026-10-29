# Mining rules

- Every mined part stores its `window` and merge confines all subtitle times to it, because one mis-read clock used to push every later caption past the video end.
- Mined-video repair re-mines only the flagged parts from the mining record and rebuilds through finalizeMiningJob, so fixes never hand-edit saved subtitles.
- Creator-uploaded subtitles (mind_vaults kind "captions", title = YouTube id) override YouTube captions in the miner, because server-side caption fetches get blocked; listVaults hides that kind.
- Playback stamp parsing reads whole minute groups ("373:19") and treats any backwards stamp not near 0 as untimed, because one mis-read clock used to shift every later caption.
- The miner's primary output is a timed `journal` (who/kind/text per moment) and the persona a job is filed under is passed as the Mind Owner when no speaker hint exists, because reaction streams otherwise absorb played-media voices into the owner's Mind, face and voice data.
- Creators fix speaker attribution with the per-video "Who is the persona?" picker, which only renames speaker labels and never touches words or times.
- Mining watches video + audio together in one Gemini call (analyzeYoutubeVideo) with sentence-level speech, typed screenItems and actions on one timeline; YouTube auto-captions are not used, because real tests showed them empty or garbled. The journal/transcript never go through the tidy-up pass.
- The topic map is built only after mining, from saved facts, on the user's own key (one batch per call, stored as a private mind_vaults row kind 'topics', title 'topics:<projectId>'), because adding work inside the miner raises failure risk and the map must never alter mined data.
- Only creator-uploaded subtitles take the text path (tryTranscriptMine, which then adds the optional screen pass); every other part goes straight to the multimodal miner.
- Mining parts are 5 minutes, and analyzeYoutubeVideo adds a screen-only pass when screenItems are fewer than one per minute, because long parts made Gemini drop the screen.
- Generic owner labels (Host/Creator/Mind Owner) and small invented "Caller/Guest N" labels are folded into the persona name after mining, because a streamer's shouting was being split into fake people.
- Mongolian parts whose speech comes back mostly in Latin letters are re-watched once with the Cyrillic rule first; the first result is kept if the retry fails.
- Uploaded videos (private bucket creator-videos, mining_jobs source_kind "upload") are cut in-browser (video-extract.ts) and mined part-by-part in order via /api/native-mine, then filed by finalizeMiningJob; background workers skip them because only the browser holds the file.
