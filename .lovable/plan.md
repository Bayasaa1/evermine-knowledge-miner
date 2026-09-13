# Clean up the setup flow: no re-asking for sign-in, simpler words, choices that fit your purpose

## 1. It still asks you to sign in

Step 2 always shows the "Sign in or sign up" heading, even for a signed-in user, because the heading is fixed text and only the card below it changes.

Fix:
- When you are already signed in, step 2 shows **"You're signed in"** with your name and a small "Use another account" link — no sign-in wording anywhere.
- Continuing from step 1 while signed in skips straight past step 2 to the keys step; the step dot stays clickable if you want to look at it.

## 2. The page is too crowded

Today step 4 stacks two nearly identical blocks (save a video, then mine a video), each with its own link box, destination picker and the long question form. That is the wall of boxes in the screenshot.

Fix:
- One block: paste a link → it is saved → it appears in a list below with a **Mine** button. No duplicate second form.
- The destination picker (persona → project) collapses to one line once chosen: "Filed under: CTS › Robot tests · Change".
- The pre-mining questions collapse behind **"Fine-tune what the AI looks for (optional)"**, closed by default with sensible answers already picked from your creation type.
- The "What you can mine" explainer becomes four short lines instead of a paragraph.

## 3. The choices don't match Robot Brain

The video-type and focus chips are one fixed global list (Podcast, Movie/Film, Football Match, Lecture…), shown identically for every creation type.

Fix — each creation type gets its own short list, with the first option preselected:

| You picked | Video type choices | Focus choices |
|---|---|---|
| Robot Brain | Robot demo, Hands-on task, Workshop / factory, Walkthrough | Movement & grasping, Objects & space, Step order |
| Gaming Mind | Gameplay, Match replay, Tutorial run | Tactics, Reactions, Mechanics |
| Voice Agent | Conversation, Podcast, Phone call, Speech | Tone & emotion, Wording, Timing |
| Sales Mind | Product demo, Sales call, Ad / promo, Review | Offers & pricing, Objections, Product details |
| Knowledge Mind | Talk / lecture, Interview, Podcast, Tutorial | Facts & answers, Explanations, Opinions |

## 4. Wording

Every label is rewritten to plain words, in English, Mongolian and Korean:

- "STEP 2A · PERSONA / Which Persona owns this content?" → "Who is posting this?"
- "STEP 2B · PROJECT" → "Which collection?"
- "STEP 2C · MEDIA & CONTEXT" → "The video"
- "Before we mine — 3 quick questions" → "Tell the AI what to look for"
- "Speaker identity — who is the Mind Owner / Host?" → "Whose voice is the Mind? (e.g. Host: Batbold)"
- "Save to Saved Minds" → "Save video"
- "Spatial trajectories, 3D grasp & ROS 2 OTA package" → "Learns movement, grasping and space from your videos"
- Long tip paragraphs cut to one sentence each; jargon (VLA, OTA, diarization, Mind Vault identity) removed from anything a first-time user sees.

## 5. Other things found

- The "Robot Brain / Embodied VLA" banner repeats on steps 3 and 4 while the same name also sits in the step title — keep it once, at the top.
- The Google sign-in text still promises "your own free Google access · nothing to maintain" next to a screen that asks for a key. That block is removed with the step-2 rewrite.
- "Save video" stays greyed with no explanation until a persona and project are picked — it will say why.
- On a phone the five numbered dots squash together; they get smaller with only the current one labelled.

## Technical notes

- `src/components/guided-studio.tsx`: step 2 renders from `useAuth()` state (title/sub chosen by `isAuthenticated`); `continueSetup` auto-advances 1 → 3 when signed in; step 4 renders a single `StepUpload` with an inline saved-video list instead of `mode="save"` + `mode="mine"`; drop `googleCopy` and the duplicate `ChosenCategory` on step 4.
- `src/lib/mining-jobs.ts`: replace the flat `VIDEO_CONTEXTS` / `PRIMARY_FOCUSES` constants with `contextsFor(category)` / `focusesFor(category)` plus a per-category default `Assessment`; keep the existing prompt markers so mining behaviour is unchanged.
- `src/components/mining-wizard.tsx`: accepts `category`, renders the per-category lists, wraps itself in a collapsed `<details>`, shows the speaker field for conversation-type videos rather than only `"Podcast"`.
- `src/components/project-target.tsx`: collapsed summary row after selection, plain-word labels, disabled-reason text.
- Copy lives in the existing `pickCopy` blocks and `src/lib/i18n.ts`, all three languages.
- No database or mining-pipeline changes.
