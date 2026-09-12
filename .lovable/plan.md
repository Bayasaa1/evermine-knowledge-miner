# Add a Subscribe button to feed videos

## What you'll get

Every video card on the home feed gets a clear **Subscribe** button next to the creator's name:

- **Free minds** — tapping Subscribe instantly subscribes you: full access (chat, voice, features) unlocks right away, and the button turns into "Subscribed".
- **Paid minds** — the button shows the creator's price (e.g. "Subscribe · $15"). Tapping it buys the mind. **Once a user has paid, they are subscribed permanently — the app records the purchase and never asks them to pay again.** The button shows "Subscribed" and opens the mind directly.
- One important current limitation: real card checkout is not connected to the app yet, so a first-time payment cannot actually be charged today. Until payments are connected, a not-yet-paid user tapping a paid mind sees a clear "checkout coming soon" message instead of a confusing error. This does NOT affect anyone who already has access — their access is stored and always recognized.
- If you're not signed in, tapping Subscribe sends you to the sign-in page first.
- The button label is translated into English, Mongolian, and Korean like the rest of the app.

## How it works (technical)

- `src/routes/index.tsx` (feed card):
  - Replace the current buy/free button next to the creator name with a **Subscribe** button.
  - Already subscribed (a `mind_purchases` row exists for this user + mind) → button shows "Subscribed" with a check; tapping opens the mind (existing primary action: chat/voice/robot). Never any payment prompt again — the existing `owned` map loaded from `mind_purchases` is the source of truth and persists across sessions and devices.
  - Not subscribed + free mind → label "Subscribe"; tap calls the existing server-side `claimMind` (which already grants free access instantly), records the subscription, shows a success toast.
  - Not subscribed + paid mind → label "Subscribe · {currency} {price}"; the server currently refuses paid grants without a payment confirmation, so we surface a clear localized "payment checkout is coming soon" message instead of a generic failure.
- `src/lib/i18n.ts` (or the feed's local copy block): add `subscribe`, `subscribed`, and the checkout-coming-soon message in en/mn/ko.
- No database changes needed: a subscription is recorded as a `mind_purchases` row (price 0 for free), which already gates chat/voice/reviews/robot access.

## What is intentionally not in this step

- Real card billing for paid minds — that needs a payment provider (Stripe/Paddle) enabled, which is a separate step you can ask for any time. After that, the same Subscribe button will charge the user once and then work exactly like the free flow.
- Unsubscribe/cancel — can be added later (removing the subscription row).

## Verification

- Typecheck passes.
- Browser check on the feed: free mind → Subscribe unlocks instantly and persists after reload; a mind the user already owns always shows "Subscribed" with no payment prompt; an unpaid paid mind shows the price and the clear checkout-coming-soon message; signed-out tap goes to sign-in; labels switch with the language selector.
