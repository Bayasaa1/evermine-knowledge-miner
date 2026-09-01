# Evermind Architecture Contract Refactor

Most of the contract is already live. This plan closes the real gaps rather than rebuilding working systems.

## Already in place (verified)

- Persona -> Project -> Link ordering is enforced in the upload wizard (`project-target.tsx` gates the mining panel until both are chosen).
- Chunk count is already derived as `ceil(duration / 300)` with a minimum of 1, both client-side and in the mining job server function — a 5-minute video evaluates to 1 chunk.
- YouTube metadata (title, description, thumbnail, duration, published date) is auto-fetched on paste and pre-fills the wizard.
- The Home Feed already queries visual, published content and refreshes live through a realtime subscription.
- Vault edit metadata and delete-video actions exist.

## What actually needs fixing

### 1. Unified data store instead of per-component loads
The Vault hub reloads through its own local `load()` function while the feed and other tabs use the shared query cache, so an edit in one tab does not refresh the others. Move the vault's persona / project / content reads onto the same shared query keys and invalidate those keys after every mutation, so persona, project, content and Core Brain views all reflect one source of truth immediately.

### 2. Delete must scrub the Core Brain
Deleting a video currently removes only the content row; its mined chunks stay in the `.json.md` Core Brain. Deletion will also strip every segment tied to that video's mind id from the stored brain payload and save a new brain version, so the AI stops answering from removed material.

### 3. Instant feed-visibility toggle
Switching a clip between public feed content and hidden training material is only possible inside the edit dialog. Add a one-tap toggle on each video card that flips the kind and immediately updates the feed.

### 4. Working Chunk Eraser and Re-mine
"Re-mine" is currently a placeholder message. It will re-queue the video through the real mining engine using its stored persona, project and settings, and the Core Brain editor's eraser will delete the selected chunk from the saved brain, not just the local preview.

### 5. Language toggle wired everywhere
The My Vaults page hardcodes English for the vault hub and mind manager. It will read the active language from the global provider, matching the feed and search pages, so the header toggle changes vault labels, terminal logs and card tags too.

## Technical notes

- Shared query keys: personas, projects, project content and vaults move to `useQuery`/`useQueryClient` with invalidation on mutation; drop the local `load()` in `vault-hub.tsx`.
- Core Brain scrubbing: extend `src/lib/mind-json.ts` with a segment-removal helper, called from delete and eraser paths, persisted via the existing `save_mind_version` flow so history stays intact.
- Re-mine reuses the existing mining job server function with the stored assessment for that content row.
- `src/routes/vaults.tsx` swaps `lang="en"` for `useLang()`.
- No schema changes required.
