# Lock down account privacy and fix Gemini throttling

## Confirmed findings

- **The screenshots show a real privacy failure in the browser.** When the active account changes, Evermind refreshes private data but leaves the previous account’s results visible until refresh finishes. Several private lists also reuse the same cache name across users. This explains why an empty new account can display another account’s personas, saved Minds, mining history, notifications, and delete controls.
- **The database itself is separating owners correctly.** The new account shown in the database has no projects, vaults, jobs, or personas. Every inspected delete rule limits deletion to the signed-in owner, and the permanent-video deletion function verifies ownership before using privileged cleanup. A second account can see stale delete buttons, but the current database rules reject deleting the first account’s records.
- **Project content is public by default.** New projects currently default to public, and all 37 current projects are published. Public feed videos and their mined transcript/tags are intentionally readable by other users. This is too permissive for a social platform where creators expect drafts and training files to stay private.
- **Gemini testing amplifies one click.** One “Test & save” action lists models and then may make four generation requests without delay. Three visible attempts can create about fifteen Gemini calls and trigger the free-tier burst limit.
- **More device data is still shared across accounts.** Cloud-drive labels/file indexes, follows, favorites, local notifications, subscription settings, and mining resume state still use shared browser storage names.
- **Chat can use a server key in one branch.** When a user selects a provider without sending a key, the chat endpoint can read a server environment key. That conflicts with the rule that every AI call must use the user’s own key.

## Fixes

1. **Clear private screens before changing accounts**
   - Cancel all in-flight private requests and fully clear the data cache whenever the user ID changes, including sign-in replacing another session.
   - Do this before setting the new account and before rendering/refetching.
   - Keep the public home feed separate from private account data.

2. **Partition every private cache by user**
   - Include the signed-in user ID in vault, Mind version, mining, notification, project-content, and update cache names.
   - Never preserve previous private results as placeholder data during an account change.
   - Reset open persona/project/Mind selections when the owner changes.

3. **Partition all private device storage**
   - Scope cloud-drive metadata, follows, favorites, local notifications, subscription settings, mining resume state, creator Minds, user memory, analytics, payouts, engine choices, and keys to the signed-in account.
   - Remove old anonymous/shared records instead of assigning them to the next person who signs in.
   - Wait until account identity is known before reading any owner-scoped browser data.

4. **Make drafts private by default**
   - Change new projects to hidden by default.
   - Save new videos as training/private unless the creator explicitly enables “Publish to feed.”
   - Keep public profile/feed reads limited to explicitly published projects and public visual content.
   - Do not expose private transcripts, mined results, training material, or vault payloads through public reads.

5. **Harden destructive actions**
   - Add explicit signed-in owner filters to client delete/update helpers, in addition to existing database protection.
   - Keep permanent deletion owner-verification before privileged cleanup.
   - Hide destructive controls while account identity is loading or changing.
   - Run live negative tests: account B attempts to delete account A’s project, persona, content, vault, version, and mining job; every attempt must affect zero rows or return not found.

6. **Stop Gemini request amplification**
   - Treat a 429 from model listing as an immediate stop.
   - Test only one available generation model per click, so one click makes at most two calls.
   - Prevent repeat clicks while testing and show the provider’s retry guidance.
   - Preserve the distinction between temporary per-minute throttling and daily quota exhaustion.

7. **Enforce user-owned AI usage**
   - Remove every server-key fallback from chat and other user-triggered AI paths.
   - If the signed-in user has no usable key, stop before making an AI call and show the key setup action.
   - Verify no Lovable AI credit path or shared provider key remains.

## Verification

- Sign in as account A, open Vaults, Mining, Notifications, and a delete menu; then switch directly to account B. Account A’s data must disappear before account B renders, and account B must start empty.
- Attempt cross-account reads and deletes using account A’s known record IDs while authenticated as account B.
- Confirm public feed content remains visible only when deliberately published; hidden projects and training content remain invisible.
- Add a fresh Gemini key and confirm one test click sends one model-list request and at most one generation request.
- Chat without a personal key must stop with setup guidance and make no provider request.
- Run focused tests, type checks, browser checks, and the security linter before reporting completion.

## Technical notes

- The primary browser leak is in the global account-change listener and private React Query keys.
- Existing row-level database rules remain; this work adds client isolation and defense in depth rather than weakening access rules.
- Any database default/policy change will be applied through a migration, with existing public-feed behavior retained only for records explicitly marked public.
