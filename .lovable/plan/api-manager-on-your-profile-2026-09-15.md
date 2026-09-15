# API Manager on your profile

Replace the "Creator Studio" row on your profile with a single, simple **API Manager** page where you handle every AI key and see what they cost you.

## What changes

**Profile page**
- The "Creator Studio — mine videos, pricing & payouts" row is removed.
- A new first row: **API Manager — keys, limits and usage**.
- "Earnings & unclaimed balance" and "Privacy & User Memory Vault" stay as they are.

**New page: API Manager**
One page, three stacked blocks, top to bottom:

1. **Your keys** — the list you already have: add a key, test it, see the last 4 characters, status dot (working / out of free quota / rejected), and remove one key without touching your spares.
2. **Spending limits** — for paid providers only: a switch to turn the provider on and a monthly cap you type in. Free providers show "free — no limit needed".
3. **Tokens and cost** — today's calls, free allowance left, when it refills, and cost per provider.

Each block has one short line of plain explanation and nothing else. Wording in English, Mongolian and Korean.

## Note on the broken link

Tapping "Creator Studio" doing nothing is worth a separate look — the page itself still exists and is reachable from My Vaults. This plan only removes the dead row from the profile; say the word if you also want Creator Studio itself repaired or deleted.

## Technical notes

- New route `src/routes/keys.tsx` with its own `head()` metadata, rendering the existing `AiKeysCard` (keys + limits, already built) and `TokenUsagePanel` (usage), plus small section headers.
- `src/routes/profile.tsx`: swap the first `Link to="/creator"` for `Link to="/keys"` with a key icon.
- No backend or key-storage changes — same `user_ai_keys` storage, same owner-only rules, still your own keys only.
