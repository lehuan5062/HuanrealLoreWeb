# lore-web HTTP API

The lore-web server exposes a small JSON + streaming API on `127.0.0.1:7420`
(configurable). The browser SPA is its only intended client. Repository reads
(`/api/repos`, `/api/status`, `/api/history`, `/api/branches`, `/api/org`) are
cached per repository with stale-while-revalidate: a filesystem watch and every
mutating request invalidate the affected entries, so a warm cache serves
instantly while still reflecting recent changes within moments. A time-to-live
bounds staleness for changes the watch cannot see. The cache persists to
`~/.lore-web/cache.json` and rehydrates on startup, so a restart serves
last-known data immediately instead of waiting on native reads; a background
revalidate corrects it, pushing an `/events` refresh if anything changed while
the server was down.

## Conventions

- Request and response bodies are JSON unless noted.
- Errors return a non-2xx status with `{ "error": "<message>" }`, where the
  message is the underlying Lore failure detail.
- `path` is an absolute path to a Lore working copy. Pass it as a query
  parameter on GETs and in the body on POSTs.

## Endpoints

### Repositories

| Method | Path | Body / query | Description |
| --- | --- | --- | --- |
| GET | `/api/repos` | — | List tracked repos, each enriched with live `branch`, `exists`, and `organization`. On a cold cache, returns immediately with `enriching: true` and unenriched entries (`branch`/`organization` absent), then finishes enrichment in the background and emits an `/events` refresh when it completes. |
| POST | `/api/repos` | `{ path, label }` | Start tracking a working copy. Rejects non-repos. |
| DELETE | `/api/repos` | `{ path }` | Stop tracking. Always succeeds, even if the folder is gone. |

### Configuration

| Method | Path | Body / query | Description |
| --- | --- | --- | --- |
| GET | `/api/config` | — | Get the configured default remote server and list of auto-discovered servers. Returns `{ defaultRemote, discoveredServers }` where `discoveredServers` is an array of `{ url, label }`. |
| POST | `/api/config` | `{ defaultRemote }` | Set the default remote server URL. Validates URL format. Returns `{ ok: true }`. |
| GET | `/api/discover` | — | Manually trigger discovery of Lore servers on the local network and return the list. Returns `{ discoveredServers }`. |

### Reads

| Method | Path | Query | Description |
| --- | --- | --- | --- |
| GET | `/api/status` | `path` | Current branch plus staged/unstaged changed files. Also returns `inMerge` (true when actively merging), `conflicts` (count of unresolved files), `revisionMerged` (merge parent hash), and `revisionStaged`. The status also includes `hasLoreignore`, `hasGitignore`, and `hasP4ignore` flags, and marks each changed entry that is itself a nested Lore working copy with `nested: true`. The full working-tree scan (which discovers untracked files, and can take seconds on a large working copy) does not block the response: the first read after a repo switch returns with `scanning: true` and only staged/tracked changes, then the scan completes in the background and an `/events` refresh tells the SPA to refetch the complete list. |
| GET | `/api/history` | `path`, `length` | Revision history (default 50), with message and timestamp. |
| GET | `/api/branches` | `path`, `archived?` | Branch list. Each branch has `id`, `name`, `location` (`LOCAL`/`REMOTE`), `category`, `latest` (tip revision), `stack` (fork point parents), `creator`, `created`, `isCurrent`, and `archived`. Pass `archived=true` to include archived branches. |
| GET | `/api/graph` | `path`, `length?`, `archived?` | Branch graph for visualization: `{ branches, histories }`. `histories` is a map of `branchId` to per-branch revision arrays (default length 100 per branch). Branches deduplicated by id, preferring `LOCAL`. Pass `archived=true` to include archived branches. Gracefully degrades: a failing per-branch history becomes an empty array, not a graph error. |
| GET | `/api/diff` | `path`, `file` | Unified diff for one file. |
| GET | `/api/auth` | — | `{ loggedIn }` — whether the CLI has a stored identity. |
| GET | `/api/org` | `path` | `{ organization, repoName, name }` for a repo. The organization is the prefix of the repo's `name` metadata (`org/repo`); `repoName` is the part after the slash. `organization` is empty when the name has no slash. |
| GET | `/api/remote-repos` | `url?` | Repositories a Lore server hosts, for picking one to clone or delete. `url` is the server base; omitted, it defaults to the same remote the Add flow suggests. Returns `{ base, repos }` where each repo is `{ id, name, url, idUrl, tracked }` — `url` is the name-based clone URL, `idUrl` the id-based one, and `tracked` is true when the repo is one of this machine's working copies (matched by `.lore/id`). |
| DELETE | `/api/remote-repos` | `{ id, base? }` | Delete a repository from its server by `id` (names of repos created without an owner do not resolve). `base` defaults to the suggested remote. Returns `{ ok: true }`, confirmed by re-listing — the underlying CLI reports a spurious error and exit 0 even on success, so its status is ignored. |

### Writes

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| POST | `/api/stage` | `{ path, files }` | Stage the given files. |
| POST | `/api/unstage` | `{ path, files }` | Unstage the given files. |
| POST | `/api/reset` | `{ path, files }` | Discard working changes to the given files, including removing newly added (untracked) files and folders. |
| POST | `/api/ignore` | `{ path, pattern }` | Append a gitignore-style `pattern` (file, `folder/`, or `*.ext`) to `.loreignore`, creating it if absent. Returns `{ ok, added }`. |
| POST | `/api/init-loreignore` | `{ path }` | Set up `.loreignore` (seeded from `.gitignore` and `.p4ignore` when present) and keep each tool's metadata out of the other's history. Returns `{ ok, created, gitignoreUpdated, gitignoreBlocked, p4ignoreUpdated, p4ignoreBlocked }`. A `*Blocked` flag is `true` when that ignore file exists but is read-only (Perforce keeps `.p4ignore` read-only until `p4 edit`), so Lore's entries could not be added — seeding `.loreignore` still succeeds. |
| POST | `/api/repair` | `{ path }` | Rebuild the working copy's `.lore` in place to purge unremovable stale index entries, preserving the repository id and remote. Refused (409) when there is committed history. Returns `{ ok, id }`. |
| POST | `/api/org` | `{ path, organization }` | Change a repo's organization. A repo's org is the `org/` prefix of its `name`, which Lore makes read-only after creation, so this rebuilds the working copy's `.lore` under a new URL (preserving the repository id and remote), which discards local committed revisions. The caller must confirm that loss first. `organization` cannot be empty or contain a slash. Returns `{ organization, repoName, name, id }`. |
| POST | `/api/branch/create` | `{ path, branch, category? }` | Create a new branch. Returns `{ branch }` with the full branch object. |
| POST | `/api/branch/archive` | `{ path, branch }` | Archive a branch. Returns `{ ok: true }`. Refused (409) if archiving the current branch. |
| POST | `/api/merge/abort` | `{ path }` | Abort an in-progress merge. Returns `{ ok: true }`. |
| POST | `/api/merge/resolve` | `{ path, mode, paths }` | Resolve conflicts for files in a merge. `mode` is one of: `mine` (keep local), `theirs` (accept remote), `manual` (mark as manually resolved), `unresolve` (mark as unresolved), `restart` (redo merge). `paths` is relative to the working root. Returns `{ ok: true }`. |

### Streamed operations

These respond with `application/x-ndjson`: one normalized Lore event per line,
ending with a `{ "tag": "DONE", "data": { "ok", "status", "message" } }` marker.
Long-running verbs also emit `*_BEGIN`/`*_PROGRESS`/`*_END` events carrying
file and byte counts, which the web UI renders as a progress bar.

| Method | Path | Body | Description |
| --- | --- | --- | --- |
| POST | `/api/commit` | `{ path, message }` | Commit the staged revision. |
| POST | `/api/sync` | `{ path, revision?, reset? }` | Sync the working copy to a revision. |
| POST | `/api/push` | `{ path, branch?, fastForwardMerge? }` | Push commits to the remote. |
| POST | `/api/clone` | `{ url, dest }` | Clone a remote repository into `dest`. |
| POST | `/api/branch/switch` | `{ path, branch, revision?, reset? }` | Switch to a branch, materializing files. Pass `reset: true` to discard working changes. Optional `revision` to switch to a specific revision on the branch. |
| POST | `/api/merge/start` | `{ path, branch, message?, noCommit?, expectedTarget? }` | Begin merging a branch into the current branch. When `expectedTarget` is given, the merge is refused with 409 if the repository's actual current branch differs — protection against clients holding a stale idea of the merge target. Without `message`, the merge is left staged (not committed). Emits `BRANCH_MERGE_CONFLICT_FILE` per file with unresolved conflicts, then `BRANCH_MERGE_START_END { hasConflicts }`. Use `/api/merge/resolve` to resolve conflicts, then `/api/commit` to finalize (or `/api/merge/abort` to cancel). |

### Events

| Method | Path | Description |
| --- | --- | --- |
| GET | `/events` | Server-Sent Events. Emits `{ "type": "refresh", "repo", "reason" }` when a tracked repo changes on disk, so the SPA refetches. |

## See also

- [How to run lore-web](../how-to/run-lore-web.md)
- [Architecture](../explanation/architecture.md)
