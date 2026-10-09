<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI chat providers receive the complete saved conversation as structured turns, because flattening or truncating history causes replies to target the wrong message.
- Empty provider output is an error, never a visible ellipsis, because silence must not look like a valid assistant reply.
- Mined interview voice samples are restricted to the named persona's speaker-tagged lines, because host speech corrupts character identity.
- Project video sequence is creator-controlled through project_content.sequence_index; horizontal feed navigation must respect it.
- Feed ranking is deterministic and signal-based, never an AI call, so recommendation does not spend anyone's credits.
- Group chat rooms live in chat_rooms/_members/_minds/_messages; membership is checked by security-definer helpers and joining happens only via join_room_by_code, because members must never see rooms they were not invited to. Mind replies in rooms run on the sending user's own keys via /api/mind-chat.
- Friendship is mutual subscription (user_subscriptions both ways, no user_blocks); human DMs are chat_rooms kind 'dm' opened only via open_dm RPC, because one-way subscribers must never DM a creator directly.
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
