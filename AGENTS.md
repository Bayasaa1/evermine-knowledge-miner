<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Subdirectories have their own AGENTS.md; read it before changing files there (src/lib/AGENTS.md holds the mining rules).
- AI receives complete structured history to address the right message.
- Call media permissions use generation guards and cancelled work cannot restart playback; this prevents streams granted after closing from surviving.
- Chat prompt knowledge is query-ranked to eight topic chunks with a bounded system context, while structured conversation history remains separate and intact.
- Room turn leases expire after 45 seconds in both RPCs and UI; token-checked cleanup rejects late replies and advances only an owner-selected sequence.
- Early module recovery reloads once/minute; its non-user timestamp survives account cleanup to prevent loops.
- Chat progression is read-only per topic; every nested branch exposes its children and sends its source title for subtree recall across all depths, so parent facts cannot crowd out detail. No AI calls or mined-data writes for suggestions.
- Open-chat display translation uses a viewport-scoped Google client with account-scoped in-memory caching; originals remain the source for saving, editing, exports and AI history, because screen translation must not mutate knowledge or spend AI credits.
- Empty provider output is an error, never a visible ellipsis, because silence must not look like a valid assistant reply.
- Mined interview voice samples are restricted to the named persona's speaker-tagged lines, because host speech corrupts character identity.
- Project video sequence is creator-controlled through project_content.sequence_index; horizontal feed navigation must respect it.
- Feed ranking is deterministic and signal-based, never an AI call, so recommendation does not spend anyone's credits.
- Rooms use member-gated RPCs/media and owner-only atomic moderator turns; replies use the caller's keys. Sharing uses ShareModal and typed cards, separate from confirmed owner-only Mind invitations with Undo.
- Group-room Mind prose strips hidden clip and video-proof markers on generation, writes, reads, and exports; legacy messages are cleaned without rewriting saved history, because rooms do not render proof metadata.
- Friendship is mutual subscription (user_subscriptions both ways, no user_blocks); human DMs are chat_rooms kind 'dm' opened only via open_dm RPC, because one-way subscribers must never DM a creator directly.


- The project map shows the topic map as a root tree (groups → topics → nested sub-topics via parentId), with thickness = facts + Q&A under it; it replaces the old network graph because a weighted hierarchy shows where knowledge is richest.
- Topic roots grow automatically at the end of finalizeMiningJob (owner's key, a few batches, failures swallowed) and root colour comes from viewer questions/reports matched read-only at view time, because creators should never have to hand-run the tree and stats must never alter mined data.
- Mongolian questions reach English-titled topic branches through a fixed read-only word bridge (bridgeQuery), and near-duplicate topics are only nested via parentId, never merged, because facts must never move or vanish.

## Anti-Regression & Surgical Edit Rules (apply on every prompt)

- Community comments use post_comments/comment_likes with RLS-backed writes and soft-deleted parent tombstones, so deleting a comment never deletes another user's replies.

- Never rewrite or regenerate an entire route or component file to fix a bug. Make the smallest diff that changes only the faulty behaviour and preserves every existing state, filter and handler, because whole-file rewrites silently drop the logic earlier work added. This covers large surfaces such as `src/routes/index.tsx`, `src/routes/creator.tsx`, `src/routes/chats.$roomId.tsx`, `src/routes/api/mind-chat.ts`, `src/components/saved-minds.tsx` and `src/components/vault-hub.tsx`.
- Single source of truth for AI keys: server-side AI execution resolves keys and role teams only through `src/lib/user-ai.server.ts` and `src/lib/ai-roles.functions.ts` (backed by tables `user_ai_keys` and `user_ai_roles`). Never add another localStorage key store, and never read legacy `src/lib/keystore.ts` / `src/lib/key-vault.ts` for server calls, because a second key source splits quota state and re-creates the false "quota exhausted" failures.
- Single source of truth for mining: every video mining job goes through `src/lib/mining-jobs.functions.ts` and `src/lib/youtube-mine.server.ts`, because the lease/claim guards that stop two workers mining the same part live only on that path.
- Whenever a database migration is added in `drizzle/migrations/`, regenerate only `src/integrations/supabase/types.ts` in the same commit, because stale types let the app compile against columns that no longer exist. `drizzle/schema.ts` must stay an empty placeholder — the platform never reads it and filling it breaks the migration tool — and `src/routes/mcp.ts` must never be hand-edited because the MCP plugin generates it; its rate limiting lives in `src/server.ts`.
- Before finishing any bug fix, run the existing unit tests (`*.test.ts` via `bun test`) to prove no regression was introduced, because a fix judged only by reading the code is how regressions ship.
- Architect Co-Pilot tools live in src/lib/architect.server.ts (types in architect-types.ts) and are dispatched by `action` in /api/diagnose-chat; read tools never write, and writes (FAQ patches beside mined data, persona binding) run only from user-pressed chat buttons, because mined data must never change without the user's say.
- Paid Mind access is granted only when the creator approves a mind_payment_orders row (decideOrder upserts mind_purchases); buyers never write purchases, because bank/Stripe-link payments are confirmed manually.
