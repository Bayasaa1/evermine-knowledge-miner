# Make every mind usable — kid-simple, one button, free by default

The minds get built and then nothing tells anyone how to run them. This plan adds the missing half, built for young users: few choices, big buttons, short words, free wherever possible.

## 1. Fewer choices

- Voice Agent is removed as a type. Four choices left: Knowledge, Robot, Sales, Gaming. Talking in your voice stays a feature of the minds that have it. Old Voice Agent minds keep working as Knowledge Minds with voice on.
- Anything optional is hidden behind "More" and closed by default. A first-time user sees one path: pick → sign in → paste your free Gemini key → add a video → done.
- Every screen: one main button, short sentences, no words a 10-year-old wouldn't know.

## 2. Free by default

- Free stays the default everywhere; paid things are never required and are marked clearly when shown.
- Only your own free keys are used. Nothing in the app spends Lovable credits — I'll go through every AI path again and prove it.
- Voice: speaking works free straight away using the device voice. Your real cloned voice is an optional extra you turn on yourself.

## 3. Why voice cloning never worked, and the fix

Cloning only runs if a paid ElevenLabs key is installed on the server. There is none, so every call silently fell back to the device voice — exactly what you saw, with nothing said.

Fix:
- The screen tells the truth: "Speaking with the device voice. Want your real voice? Add your own voice key."
- ElevenLabs joins your own key list next to Gemini, pasted once and tested. Cloning then uses your key only.
- Honest note: cloning your real voice needs a paid ElevenLabs plan; the free device voice is always available and costs nothing.

## 4. One "Use it" page per mind

One big "Use this mind" button from the mind, My Vaults and the feed. Every type gets the same simple page:

- **Try it now** — one button, starts it right here.
- **Take it somewhere** — one button, copies a link or downloads a ready file.
- **Working?** — a green or grey dot, no checking by hand.

Per type:

- **Knowledge** — Talk to it. Copy a share link.
- **Gaming** — Coach: press Start, allow screen and mic, it watches and helps. Teammate: press Download, get one folder, double-click the start file, type your server once. Green dot when the bot joins, plus the in-game commands listed.
- **Robot** — press Prepare robot: get the file and a copy-link button, green dot when the robot picks up the mind, plus an honest note on what the robot needs.
- **Sales** — press Open my shop.

## 5. Sales Mind: real selling

- Add products: name, photo, price, stock. Nothing else required.
- The mind shows them in chat with a Buy button.
- A public shop page per mind, with the mind answering buyer questions.
- Payment through Stripe, an orders list for you, a receipt for the buyer.

## 6. Tested, nothing left half-wired

After each part: run it in the browser, press every button, and check the screens that touch the same thing (feed, vaults, alerts, keys) still work. All copy in English, Mongolian and Korean, at a child's reading level.

## Technical notes

- `creation-category.ts`: drop `voice`; read legacy `voice` rows as `knowledge` + voice capability (no data rewrite). `create-wizard.tsx` order becomes four.
- Voice: add `elevenlabs` to the provider catalog (`key-manager.ts`, `ai-keys-card.tsx`); `api/voice-clone.ts` and `api/mind-voice.ts` resolve the caller's stored key via the owner-scoped path in `user-ai.server.ts` instead of `process.env.ELEVENLABS_API_KEY`; keep the `no_clone` device-voice fallback but surface it in the UI. Sweep every `process.env[*_API_KEY]` AI path for platform-key leftovers.
- New route `src/routes/use/$mindId.tsx` + `src/components/use-guide.tsx`; per-category actions in `src/lib/use-guide.ts`. Entry points: mind explorer, vault hub, feed primary action.
- Simplicity pass: collapse optional blocks in `guided-studio.tsx`, `mining-wizard.tsx`, `miner-pool.tsx` behind one "More options" details; default everything sensible.
- Gaming: reuse `buildTeammateBotSource`; ship a zip (bot file + `start.sh`/`start.cmd` + readme) and a token-scoped gaming package route mirroring `api/public/v1/mind/$token/package[.]json.ts`. Status dot from last-pull time.
- Robot: `robot-deployment-studio.tsx` gains the plain-language mode (copy link, download `rosClientScript`, last-pull dot).
- Sales: `products` + `orders` tables (owner-scoped RLS + GRANTs, service_role for the webhook), Stripe checkout, public `src/routes/shop/$mindId.tsx`, webhook under `src/routes/api/public/`. Products injected into the sales mind prompt.
- roadmap.md gains a "Make every mind usable" section with these items.

## Order of work

1. Remove Voice Agent; honest voice status + your-own-key cloning; credit sweep.
2. Simplicity pass + the Use-it page with Knowledge and Gaming.
3. Robot install + pull check.
4. Sales products, shop page, checkout, orders.
