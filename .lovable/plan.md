# Make every mind usable: one "How to use this" page per type

Today the minds get built and then stop. This plan adds the missing half: for every mind, a single page that says who runs it, where it runs, and exactly what to do — plus real selling for Sales Minds and the removal of Voice Agent.

## 1. Remove Voice Agent as a type

- The create screen drops to four choices: Knowledge, Robot, Sales, Gaming.
- Voice is not lost — talking in your voice stays available on the minds that already have it (Knowledge, Sales, Gaming).
- Minds already made as Voice Agent keep working and are shown as Knowledge Minds with voice turned on.

## 2. One shared "Use it" page for every mind

Every mind gets the same new page, opened from the mind and from My Vaults. Same three parts each time, filled in differently per type:

- **What this mind can do** — plain list of what it learned and what it can be asked.
- **Where it runs** — in Evermind, on your computer, on your robot, or on your shop page.
- **Steps** — numbered, copy-paste ready, with a working/not-working indicator at the end.

Per type:

**Knowledge Mind** — runs inside Evermind. Steps: share the link, or paste a small snippet to put the chat on your own website.

**Gaming Mind** — two halves, clearly split.
- Coach (runs in Evermind): press start, share your screen and mic, it watches and advises. Nothing to install.
- Teammate (runs on your PC): a one-page setup — install Node.js (linked), download the teammate file, paste one command with your server address. A "test connection" box tells you whether the bot joined. In-game commands are listed on the page.

**Robot Brain** — runs on the robot. A prepared install file plus the hidden pull link and a copy button, with a short check page that confirms the robot fetched the mind. Written for someone who is not a robotics engineer, with an honest note about what a robot must already have.

**Sales Mind** — runs on your shop page (see below).

## 3. Sales Mind: real products and checkout

- Creator adds products to a mind: name, photo, description, price, currency, stock or unlimited.
- The mind is told about those products and can show them in chat with a Buy button.
- A public shop page per mind: the products plus the mind answering buyer questions.
- Checkout and payment through Stripe, with orders listed for the creator (paid, pending, refunded) and a receipt email to the buyer.
- Payouts go to the creator's connected account.

## 4. Everything localized

All new copy in English, Mongolian and Korean.

## Technical notes

- `creation-category.ts`: drop `voice`; map existing `voice` rows to `knowledge` with the `voice` capability at read time (no data rewrite). `capabilities.ts` unchanged otherwise. `create-wizard.tsx` order becomes four.
- New route `src/routes/use/$mindId.tsx` + `src/components/use-guide.tsx`, with per-category step definitions in `src/lib/use-guide.ts` (single source of truth for titles, steps, commands, links). Entry points: mind explorer, vault hub, feed primary action.
- Gaming: reuse `buildTeammateBotSource`/`downloadTeammateBot`; add a token-scoped gaming package route mirroring `api/public/v1/mind/$token/package[.]json.ts` so the bot pulls updates instead of embedding a frozen brain. Coach stays `game-coach.tsx` + `api/mind-coach.ts`.
- Robot: `robot-deployment-studio.tsx` gains a plain-language mode (copy link, download installer script from `rosClientScript`, last-pull timestamp read from the package route).
- Sales: new tables `products` and `orders` (owner-scoped RLS + GRANTs, service_role for webhooks), Stripe via the payments integration, public shop route `src/routes/shop/$mindId.tsx`, webhook under `src/routes/api/public/`. Product context injected into the sales mind prompt.
- roadmap.md gains a "Make every mind usable" section.

## Order of work

1. Remove Voice Agent + the shared Use-it page frame.
2. Knowledge and Gaming guides (nothing new needed behind them).
3. Robot guide + pull check.
4. Sales products, shop page, Stripe checkout, orders.
