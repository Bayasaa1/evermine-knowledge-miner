# Make every mind usable — one page, one click, your keys only

The minds get built and then stop. This plan adds the missing half: for every mind, one simple page that says who runs it and where, with a single button wherever a button is possible. Plus: Voice Agent removed as a type, voice cloning actually working, real selling for Sales Minds.

## 1. Remove Voice Agent as a type

- Create screen drops to four: Knowledge, Robot, Sales, Gaming.
- Talking in your voice is not lost — it stays a feature of the minds that have it.
- Minds already made as Voice Agent keep working, shown as Knowledge Minds with voice on.

## 2. Why voice cloning never worked, and the fix

Today cloning only runs if a paid ElevenLabs key is installed on the server. There is none, so every call quietly falls back to the phone's robot voice — exactly what you saw.

Fix: ElevenLabs joins your own key list next to Gemini and Groq. You paste your free key once, press Test, and cloning uses your key — never the platform's, never Lovable credits. Without a key the page says plainly "device voice only — add a key to hear your real voice", instead of failing silently. Every AI path is checked again so nothing calls anything but your own keys.

## 3. One "Use it" page per mind — click, don't read

Opened by a single "Use this mind" button from the mind, My Vaults and the feed. Same three parts every time, one big action at the top:

- **Try it now** — one button that starts the thing right here (chat, voice, coach).
- **Put it somewhere else** — one button that copies the link, or downloads the ready file.
- **Is it working?** — a live indicator, not instructions to check yourself.

Per type:

**Knowledge Mind** — Talk to it (button). Copy a share link, or copy a one-line snippet to put the chat on your own site.

**Gaming Mind** — two clear halves.
- Coach, runs here: press Start Coach, allow screen and mic, it watches and advises. Nothing to install.
- Teammate, runs on your PC: press Download teammate, get a single folder with a start file; you double-click it and type your server address once. The page shows a green dot when the bot joins, and lists the in-game commands.

**Robot Brain** — press Prepare robot install: get the file plus a copy-link button, with a green dot when the robot has pulled the mind. Honest note about what the robot must already have.

**Sales Mind** — press Open my shop page.

## 4. Sales Mind: real products and checkout

- Add products to a mind: name, photo, description, price, stock.
- The mind can show them in chat with a Buy button.
- A public shop page per mind: products plus the mind answering buyer questions.
- Payment through Stripe, orders list for you, receipt for the buyer, payouts to your account.

## 5. Nothing left half-wired, and tested

Every change is followed by a real run in the browser: create, mine, open the Use page, press each button, and check the other screens that touch the same thing (feed, vaults, alerts, key list) still work. All copy in English, Mongolian and Korean.

## Technical notes

- `creation-category.ts`: drop `voice`; read legacy `voice` rows as `knowledge` + voice capability (no data rewrite). `create-wizard.tsx` order becomes four.
- Voice: add `elevenlabs` to the provider catalog in `key-manager.ts`/`ai-keys-card.tsx`; `api/voice-clone.ts` and `api/mind-voice.ts` resolve the caller's stored key (same owner-scoped path as `user-ai.server.ts`) instead of `process.env.ELEVENLABS_API_KEY`; keep the `no_clone` device-voice fallback but surface it in the UI. Audit every `process.env[*_API_KEY]` AI path for leftovers.
- New route `src/routes/use/$mindId.tsx` + `src/components/use-guide.tsx`; per-category step/action definitions in `src/lib/use-guide.ts`. Entry points: mind explorer, vault hub, feed primary action.
- Gaming: reuse `buildTeammateBotSource`; ship a zip (bot file + `start.sh`/`start.cmd` + readme) and a token-scoped gaming package route mirroring `api/public/v1/mind/$token/package[.]json.ts` so the bot pulls updates. Status dot from last-pull timestamp.
- Robot: `robot-deployment-studio.tsx` gains the plain-language mode (copy link, download `rosClientScript` installer, last-pull dot).
- Sales: `products` + `orders` tables (owner-scoped RLS + GRANTs, service_role for the webhook), Stripe checkout, public `src/routes/shop/$mindId.tsx`, webhook under `src/routes/api/public/`. Products injected into the sales mind prompt.
- roadmap.md gains a "Make every mind usable" section with these items.

## Order of work

1. Remove Voice Agent; fix voice cloning on your own key (test it end to end).
2. The Use-it page frame + Knowledge and Gaming.
3. Robot install + pull check.
4. Sales products, shop page, checkout, orders.
