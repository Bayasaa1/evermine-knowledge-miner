# Subscribe button + creator subscription lengths

## What you'll get

### 1. Creator side — choose plan lengths
In Creator Studio's Monetization panel, a creator can offer any mix of four plan lengths, each with its own price:

- 1 month
- 3 months
- 1 year
- Lifetime (one-time payment, never expires)

The creator turns on the lengths they want, types a price for each (any amount, 0 = free), and the panel shows what they receive after the platform commission for each length. Free mode still works: with Free selected, the mind is open to everyone.

### 2. Viewer side — Subscribe button on feed videos
Every video card on the home feed gets a **Subscribe** button next to the creator's name:

- If the mind is free → tapping Subscribe unlocks it instantly and the button becomes "Subscribed".
- If the mind is paid → tapping Subscribe opens a small sheet listing the plan lengths the creator offers with their prices; the viewer picks one.
- **Once someone has paid, they stay subscribed for the length they bought and are never asked to pay again while it is active — lifetime never expires.** Their card always shows "Subscribed" and opens the mind directly.
- Current limitation: real card checkout is not connected to the app yet, so a brand-new paid purchase can't be charged today. Until payments are turned on, choosing a paid plan shows a clear "checkout coming soon" message. Anyone who already has access is unaffected.
- Not signed in → tapping Subscribe goes to sign-in first.
- All labels translated in English, Mongolian, and Korean.

## How it works (technical)

**Data**
- Extend the creator plan model in `src/lib/subscription.ts` from a single `monthlyPrice` to a `tiers` record keyed by `month | quarter | year | lifetime`, each `{ enabled, price }`. `normalizePlan` upgrades older saved plans (existing `monthlyPrice` becomes the enabled `month` tier) so nothing breaks.
- Migration on `public.mind_purchases`: add `plan` text (default `'lifetime'`) and `expires_at` timestamptz nullable. Existing rows stay valid forever. Include the required GRANTs pattern check — table already exists, so only `ALTER TABLE`.
- A subscription is active when `expires_at IS NULL` (lifetime) or `expires_at > now()`.

**Server**
- `src/lib/purchases.functions.ts` `claimMind`: accept a `plan` input, resolve the authoritative price from the creator's published plan/catalogue, and only write a row when the resolved price is 0. Set `expires_at` from the plan length (1/3/12 months, or null for lifetime). Paid plans still return `requiresPayment` until a payment provider is connected.
- `listPurchases` in `src/lib/purchases.ts` returns `plan` and `expires_at`; the feed filters out expired rows when building the owned map.

**UI**
- `src/components/subscription-panel.tsx`: replace the single price field with four tier rows (toggle + price + revenue split per tier), keep the Free/Paid switch and payout notice, localized in en/mn/ko.
- `src/routes/index.tsx`: the creator-row button becomes Subscribe / Subscribed; paid minds open a plan-picker sheet built from the creator's offered tiers; success and payment-required toasts localized.
- `src/lib/i18n.ts` or local copy blocks: add `subscribe`, `subscribed`, tier names, and the checkout-coming-soon message in en/mn/ko.

## Not in this step

- Real card billing and automatic renewal — needs a payment provider (Stripe/Paddle) enabled; ask any time and the same Subscribe button will start charging.
- Cancel/refund flows.

## Verification

- Migration applies, types regenerated, typecheck passes.
- Browser check: creator can enable and price all four lengths and see the split; feed shows Subscribe; free mind unlocks instantly and persists after reload; an owned mind never re-prompts for payment; paid mind shows the plan sheet and the clear checkout message; signed-out tap goes to sign-in; labels switch with the language selector; layout correct on a phone-width screen.
