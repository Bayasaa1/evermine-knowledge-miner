# Finish the per-customer privacy lock

The main account separation is already in place. This pass closes the remaining gaps and proves that one customer cannot see, edit, or delete another customer’s private work.

## Finish the safeguards

- Require the current signed-in account on every remaining create, switch, assign, update, and delete action for projects, videos, personas, and custom brain links.
- Add the account owner as an explicit condition on each database change, in addition to the existing database privacy rules.
- Keep edit, publish, move, and delete controls hidden until the current account has finished loading and the displayed item belongs to it.
- Keep private projects and newly mined videos private until the creator explicitly publishes them.

## Fix the misleading feed action

- Make “Move to feed” actually publish the parent project as well as mark the video as public content.
- Keep “Move to training” private and excluded from the public feed.
- Show a clear success or failure message instead of silently leaving a finished video hidden.

## Verify by trying to break it

- Test with two separate customer accounts: create private work in account A, switch to B, and confirm A’s personas, projects, vaults, jobs, notifications, and local data disappear before B’s data renders.
- Attempt cross-account reads, edits, moves, and deletes using A’s record IDs while signed in as B; every attempt must return nothing or be rejected, with A’s records unchanged.
- Confirm public feed behavior separately: only deliberately published visual videos are visible to other people; private and training-only videos remain hidden.
- Recheck sign-out, same-device account switching, browser errors, type safety, and backend security checks.

## Related verified cleanup

- Update Groq key testing to use its current model list and fallback candidates. The present single test model has been retired, which makes valid Groq keys look unusable.
- Preserve the rule that all AI calls use the customer’s own key and never Lovable credits or a shared app key.

## Technical notes

- Extend the existing `currentOwnerId()` second-lock pattern to the remaining mutation helpers.
- Preserve row-level privacy rules as the primary server-side boundary; client ownership filters are defense in depth.
- Keep private query keys account-scoped and clear private cached data before rendering a changed session.
- Verify the feed’s required pair of states: visual content plus a published parent project.
