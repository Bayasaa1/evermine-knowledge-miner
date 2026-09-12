# Add a Subscribe button to feed videos

## What you'll get

Every video card on the home feed gets a clear **Subscribe** button next to the creator's name:

- **Free minds** — tapping Subscribe instantly subscribes you: full access (chat, voice, features) unlocks right away, and the button turns into "Subscribed".
- **Paid minds** — the button shows the creator's monthly price (e.g. "Subscribe · $15/mo"). Tapping it starts the buy flow for that creator. Paid unlocks still require payment to be connected, so for now a paid tap shows a clear message instead of silently failing.
- If you're not signed in, tapping Subscribe sends you to the sign-in page first.
- The button label is translated into English, Mongolian, and Korean like the rest of the app.

## How it works (technical)

- `src/routes/index.tsx` (feed card):
  - Replace the current buy/free button next to the creator name with a **Subscribe** button.
  - Not subscribed + free mind → label "Subscribe"; tap calls the existing server-side `claimMind` (which already grants free access instantly), marks the mind as subscribed, shows a success toast.
  - Not subscribed + paid mind → label "Subscribe · {currency} {price}/mo"; tap calls the same claim flow; the server already refuses paid minds without a payment confirmation, and we surface that as a clear "payment required — checkout coming soon" toast instead of a generic failure.
  - Subscribed → button shows "Subscribed" with a check and tapping it opens the mind (existing primary action: chat/voice/robot).
  - Subscribed state reuses the existing `owned` map loaded from `mind_purchases`, so subscriptions persist across sessions and devices for the signed-in account.
- `src/lib/i18n.ts` (or the feed's local copy block): add `subscribe`, `subscribed`, `perMonth`, and the payment-required message in en/mn/ko.
- No database changes needed: a subscription is recorded as a `mind_purchases` row (price 0 for free), which already gates chat/voice/reviews/robot access.

## What is intentionally not in this step

- Real monthly card billing for paid minds — that needs a payment provider (Stripe/Paddle) enabled, which is a separate step you can ask for any time.
- Unsubscribe/cancel — can be added later (removing the subscription row).

## Verification

- Typecheck passes.
- Browser check on the feed: free mind → Subscribe unlocks instantly and persists after reload; paid mind shows the price and a clear payment message; signed-out tap goes to sign-in; labels switch with the language selector.
