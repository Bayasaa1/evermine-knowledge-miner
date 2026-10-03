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

- AI chat providers receive the complete saved conversation as structured turns, because flattening or truncating history causes replies to target the wrong message.
- Empty provider output is an error, never a visible ellipsis, because silence must not look like a valid assistant reply.
- Mined interview voice samples are restricted to the named persona's speaker-tagged lines, because host speech corrupts character identity.
- Project video sequence is creator-controlled through project_content.sequence_index; horizontal feed navigation must respect it.
- Feed ranking is deterministic and signal-based, never an AI call, so recommendation does not spend anyone's credits.
- Group chat rooms live in chat_rooms/_members/_minds/_messages; membership is checked by security-definer helpers and joining happens only via join_room_by_code, because members must never see rooms they were not invited to. Mind replies in rooms run on the sending user's own keys via /api/mind-chat.
- Friendship is mutual subscription (user_subscriptions both ways, no user_blocks); human DMs are chat_rooms kind 'dm' opened only via open_dm RPC, because one-way subscribers must never DM a creator directly.
