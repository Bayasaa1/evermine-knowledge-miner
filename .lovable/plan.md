# API Manager: keys that are really there, roles you can really change

## What is wrong now

Your keys are saved in **two different places** and only one of them is shown.

- When you add a key, it is written to the browser you added it in **and** copied to your account.
- The "My AI keys" list only reads the browser copy.

So on your phone at ever-mind.dev the page says "No keys yet" even though your account holds every key you added. Everything that runs from your browser — translating, chatting, mining started from the page — asks that same empty browser copy, which is why nothing works. Nothing was ever charged to Lovable; the jobs simply stopped for lack of a key.

The six role rows have the opposite problem: they read the **account** list, and when a job allows only one engine the row shows plain text instead of a dropdown, so there is nothing to change.

And the screen opens with a wall of mining advice that belongs in the upload flow, not here.

## What will change

**1. One key list, on your account.**
On opening the API Manager, keys are pulled from your account and put back into this browser. Every key you ever added shows up on every device you sign in on, with its last 4 characters, status and today's usage. A key added on this phone is still copied up to your account, as now. If a key exists on your account but not on this device, it is restored silently — no "not saved on this device" warnings any more.

**2. The six roles become real dropdowns.**
Every row lists every key that can do that job, always as a dropdown, even when there is one engine. Under each row, one plain line: which key would run it right now. If the account has no key for that job, the row says so and links to "Your keys" instead of showing a dead menu.

**3. Auto-switch checkbox.**
One checkbox per row: "If this key runs out, use my next key." On (the default) the job walks down your key order when a key hits its daily limit; off means the job stops and tells you, instead of quietly moving to another key. A key that hit its limit shows the time it comes back.

**4. Honest job names.**
"Face on calls" is not face cloning — Gemini cannot clone a face. It only **looks** at the caller's camera during a video call and describes mood and surroundings. It is renamed **"Seeing on video calls"**, with that sentence as its description. Real face cloning does not exist in the app; nothing will pretend it does. "Voice clone" keeps its honest note: with no ElevenLabs key of your own, minds speak with the free device voice.

**5. This page becomes only key management.**
The long mining-advice block ("Best first choice", "Faster mining", "Not worth it here") moves out of the API Manager. The page becomes: your keys → who runs what → tokens and cost. Nothing else.

**6. Proof it works, before you risk a long job.**
A single "Check everything" button at the top runs one tiny call per job with the key assigned to it and marks each row green or red with a plain reason. You can see translating and chatting answer before ever starting a mining run.

**7. Nothing touches Lovable credits.**
Confirmed again while planning: no AI call in the app uses a platform key — every path resolves your own saved key and stops with "add your key" when there is none. The API Manager will state this in one line so it is visible, not just true.

## Technical notes

- New server fn `listUserAiKeys` (owner-scoped, returns provider + full key value for the caller only) in `src/lib/user-ai-keys.functions.ts`; `src/components/ai-keys-card.tsx` merges account rows into the device vault via `key-manager.addKey`/`saveApiKeys` on mount, de-duplicating by value.
- `src/lib/ai-roles.ts`: rename `face_clone` copy to "Seeing on video calls" in EN/MN/KO (the role id stays, so saved choices survive); add `autoFallback` to `RoleChoice`.
- Migration: add `auto_fallback boolean not null default true` to `user_ai_roles`; `setAiRole` accepts and writes it.
- `src/lib/user-ai.server.ts`: when `auto_fallback` is false and the assigned key is exhausted/missing, throw the honest `no_credential` error instead of falling back to the newest key.
- `src/components/ai-roles-card.tsx`: always render the select; drop `DEVICE_ROLES` and the not-on-device warning (no longer possible); add the checkbox and a "Check everything" button looping `testAiRoleKey`.
- `src/components/ai-keys-card.tsx`: move the tips block behind the mining wizard (or delete it from this page).
- After building: sign in on a second browser, confirm the keys appear without re-pasting, change all six roles, run "Check everything", and confirm a translation renders.
