# Every customer gets their own space

Right now a second person signing in on the same browser can still see the first person's screen: personas, Saved Minds, mining history, notifications, even delete buttons. The records in the database do belong to the right owner, and the database refuses cross-account deletion — but the app keeps showing the old person's screen, and a lot of things saved inside the browser have no owner at all. That is the problem, and it is fixed here.

## What the big platforms do (and what we will copy)

1. **One identity owns everything.** Every row, file and setting is stamped with the account that created it, and the server re-checks the owner on every read and write — never trusting the browser.
2. **Nothing private is shown by default.** New material starts private. Going public is a deliberate act.
3. **The screen belongs to the session.** The moment the session changes, everything on screen and in memory from the previous person is thrown away before anything new is drawn.
4. **The device is treated as shared.** Anything stored in the browser is filed under the account that owns it, and is removed on sign-out.
5. **Least exposure.** Public pages show only the few fields the public needs — never private transcripts, drafts or training material.
6. **Verified by trying to break it.** The fix is not finished until one account provably fails to read or delete another account's things.

## What gets built

### 1. Instant blank slate on any account change
- The moment the signed-in person changes — sign-in, sign-out, switch, expired session — cancel every request in flight and empty the whole private screen cache before the new person is set.
- Nothing from the old account may be reused as "something to show while loading".
- Any open persona, project or Mind resets to nothing.
- The public home feed stays; only private material is dropped.

### 2. Every private list filed under its owner
- Vaults, Saved Minds, Mind versions, mining jobs, project content, notifications and creator updates are all stored under the owner's account in the app's memory, so two accounts can never land in the same slot.
- Private screens show nothing at all until the owner is known.

### 3. Everything stored on the device gets an owner
- Cloud-drive list, follows, favourites, local notifications, subscription settings, mining resume, creator Minds, personal memory vault, usage stats, payout details, engine choices and API keys all get filed under the signed-in account.
- Anything left over from a signed-out or older session is deleted, never handed to the next person.
- Sign-out wipes the current account's device data.

### 4. Private by default
- New projects start hidden. Publishing is a deliberate switch.
- A newly saved video stays private until the creator chooses "show on feed".
- Public reading stays limited to what a creator deliberately published, and returns only the fields the feed needs.
- Private transcripts, mined results, training material and vault contents are never readable by anyone but the owner.

### 5. Deletion that can only touch your own things
- Every delete and edit sent from the app carries the signed-in owner, on top of the database rules already in place.
- Delete buttons are hidden while the account is still loading or changing.
- Permanent video deletion keeps verifying ownership before any cleanup.

### 6. Gemini key test stops hammering Google
- One "Test & save" click currently makes up to five requests to Google, which is why three attempts looked like "too many requests". It will make one check plus at most one test call, stop immediately when Google says slow down, and keep telling apart "busy for a minute" from "daily limit reached".

### 7. No shared AI key anywhere
- One chat path could still fall back to a key stored on the server. That is removed: if you have no key of your own, the app stops and offers the setup step instead of calling any AI.

## How I will prove it works

- Sign in as person A, open Vaults, Live mining and Notifications, then switch straight to person B: A's content must vanish before B's screen appears, and B must start completely empty.
- As person B, deliberately try to read and delete person A's project, persona, video, Mind, version and mining job — every attempt must fail.
- Confirm a brand-new account sees no history, no notifications and no Saved Minds.
- Confirm hidden projects and training-only videos never appear to anyone else.
- Add a fresh Gemini key and confirm a single click makes at most two calls to Google.
- Confirm chatting without a key never reaches an AI service.
- Run the security check, type check and a real browser pass before reporting it done.

## Technical notes

- Root cause of the screenshots: the sign-in handler only fully clears the cache on sign-out, and several private query keys omit the user id, so a sign-in that replaces another session repaints account A's cached rows.
- Fixes: clear + cancel on any user-id change in `src/routes/__root.tsx`; add the user id to private query keys; wrap remaining unscoped IndexedDB keys (`social_*`, `cloudStorageHub`, `subscription-plan`, `mining-resume`) in `scopedKey` behind `whenScopeReady`.
- Default privacy: migration flipping `projects.published` default to false, plus wizard defaults; public SELECT policies stay limited to `published = true` and `VISUAL_CONTENT`.
- Gemini: single-model probe and immediate 429 stop in `testKey`; drop `PROVIDER_SECRET` fallback in `src/routes/api/mind-chat.ts`.
- Existing row-level rules stay as they are; this adds client isolation and defence in depth.
