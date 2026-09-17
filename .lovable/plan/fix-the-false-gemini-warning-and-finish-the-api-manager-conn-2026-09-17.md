# Fix the false Gemini warning and finish the API Manager connection

The screenshots confirm the contradiction: API Manager shows a saved Gemini key, while Notifications says no Gemini key exists. The code confirms why: Notifications and parts of mining still inspect the old browser-only key list instead of the signed-in account keys shown in API Manager.

## Restore the hidden Groq, Mistral, and OpenRouter keys

The live account currently contains only Together, Cerebras, and Gemini in the account store. Groq, Mistral, and OpenRouter were saved into the older browser-only store, then hidden because API Manager replaces that list with the account list after sign-in.

- On the signed-in API Manager screen, detect existing browser-only keys and securely import each full key into the owner’s account store once.
- Preserve provider, custom label, tested model, rank, enabled state, cost type, and masked identity during import.
- Show a clear per-key import result; never silently discard a key when an import or provider test fails.
- After import, list all six saved providers together and make Groq, Mistral, and OpenRouter immediately available in every compatible role selector.
- Stop saving signed-in keys to two places. New keys, deletion, ordering, status, limits, and role assignments will use the account store only.
- Keep the browser-only store solely as a one-time migration source, then remove the migrated copies from active selection so they cannot conflict.

## Fix the one source of truth

- Make account keys and the six “Who runs what” assignments the only credential source for signed-in users.
- Remove the old browser-key check from Notifications and mining readiness.
- Keep browser-only key helpers only for signed-out/local behavior that genuinely needs them; no signed-in AI job may use them.
- Refresh key availability immediately after adding, deleting, enabling, disabling, testing, or reassigning a key.

## Correct Notifications

- Replace the current device-only `hasAnyCredential()` check with an authenticated server check of the account’s usable keys and role assignments.
- Show no “Add Gemini key” warning when a usable Gemini key is saved.
- If Mining specifically lacks a usable Gemini assignment, say that precisely and open `/keys`, not the old Creator/Engines section.
- Distinguish missing key, temporarily cooling down, daily quota, invalid key, and disabled key instead of treating all of them as “missing.”

## Finish every active connection

- Translation, chat, Core Brain, video-call sight, subtitle repair, direct mining, queued mining, and user-brain mining will all resolve the selected account key on the server.
- Replace the remaining mining picker/readiness calls that still use the device vault.
- Let old queued/background mining jobs without a stored credential resolve the owner’s current Mining assignment before pausing.
- Remove obsolete request fields and comments that imply the browser must send a Gemini key.
- Preserve automatic fallback only when the user enabled it; never silently substitute another provider when it is off.

## Make status truthful

- A saved key is not automatically “working.” Display saved, working, cooling down, quota reached, disabled, or rejected from the same account record used by real jobs.
- A role test must run the same model, request shape, and credential path as that role’s real work. Groq, Mistral, and OpenRouter must each receive a real role-compatible request after import.
- Translation tests will use an actual multi-string translation batch, not a tiny “OK” request.
- Clear stale cooldown/error state after a successful real call.

## Verify before claiming completion

- Sign in as the affected account and confirm Gemini, Groq, Mistral, OpenRouter, Together, and Cerebras all appear in API Manager; any provider rejection remains visible instead of hiding the row.
- Confirm Notifications no longer asks for a key.
- Assign an available Groq, Mistral, or OpenRouter key to Translation, then visibly verify a real subtitle batch returns different Korean/Mongolian text through that exact selected provider.
- Run one chat reply, one Core Brain call, one video-call sight check, and one short mining chunk through the selected account keys.
- Verify automatic fallback both on and off.
- Confirm an old queued mining job can resume from the current Mining assignment.
- Search active code for Lovable AI gateway calls and report the result; no feature may use Lovable AI credits.
- Report any provider-side quota or billing rejection exactly as returned, without calling it an app connection success.

## Technical details

- Replace `NotificationCenter` → client `hasAnyCredential()` with a protected account-status server function.
- Add a one-time authenticated migration from the legacy device vault to owner-scoped account rows, then migrate active `bestGeminiKey()`/device-keystore consumers in mining readiness and related paths to account status/role reports.
- Update the background mining worker to resolve `user_ai_roles` + owner-scoped `user_ai_keys` when an old job has no credential, while retaining the job owner check.
- Use the existing owner-scoped key IDs for role selection; do not match by provider alone.
- Keep all private keys server-side and return only provider, status, key ID, and masked tail to the screen.
