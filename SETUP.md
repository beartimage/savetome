# saveto.me — Personal Internet Library setup (Cloudflare)

This adds real sign-in (Google / GitHub) and per-user cloud sync on top of the
static app. The app still works with **no** backend — it silently stays in
local (IndexedDB) mode until the Worker below is deployed and you sign in.

Architecture:

```
Browser (index.html + src/, built to dist/)
   |  /api/*                         everything else -> static assets
   v
Cloudflare Worker (worker.js)
   |  OAuth (Google/GitHub) + sessions (signed JWT cookie)
   v
D1 (SQLite + FTS5) -> users + bookmark rows + private full-text index
Workers AI          -> multilingual embeddings + grounded answers
Vectorize           -> tenant-namespaced semantic vectors
```

You only need to do this once. Requires the Wrangler CLI:

```bash
npm install -g wrangler        # or: npx wrangler ...
wrangler login
```

---

## 1. Create the D1 database

> Already done for this project: the database **`d1savetome`** exists and its
> `database_id` is already filled into **wrangler.toml**. Skip `d1 create` unless
> you're setting up a fresh account; just create the tables below.

```bash
cd ~/Desktop/saveto.me
# (only if the DB doesn't exist yet)
wrangler d1 create d1savetome    # then paste the printed database_id into wrangler.toml
```

Create the tables (remote):

```bash
wrangler d1 execute d1savetome --remote --file=./schema.sql
```

For an existing deployment, preview and apply pending migrations before the
newer Worker is deployed:

```bash
wrangler d1 migrations list d1savetome --remote
wrangler d1 migrations apply d1savetome --remote
```

Migration `0002_server_owned_sync_time.sql` clamps legacy future timestamps.
Migration `0003_personal_library_index.sql` adds full-text, enrichment, duplicate,
and Ask tables and backfills existing bookmarks without replacing sync data.

## 2. Create the OAuth apps

You need one per provider. The **redirect / callback URL** must be exactly
(primary custom domain — this is the live origin):

```
https://saveto.me/api/auth/google/callback
https://saveto.me/api/auth/github/callback
```

`https://www.saveto.me` permanently redirects to the primary origin before
OAuth begins, so a second `www` callback does not need to be registered.

Also register the workers.dev origin so sign-in works there too (the Worker
derives the redirect URI from the request origin automatically, so every origin
you use must be registered in the OAuth app):

```
https://savetome-website.savetome.workers.dev/api/auth/google/callback
https://savetome-website.savetome.workers.dev/api/auth/github/callback
```

**Google** — https://console.cloud.google.com/apis/credentials
- Create Credentials -> OAuth client ID -> *Web application*.
- Authorized redirect URI: the `.../google/callback` URL above.
- Configure the OAuth consent screen (External, add your email as a test user).
- Note the **Client ID** and **Client secret**.

**GitHub** — https://github.com/settings/developers -> New OAuth App
- Homepage URL: `https://saveto.me`
- Authorization callback URL: the `.../github/callback` URL above.
- Note the **Client ID**; generate a **Client secret**.

## 3. Configure IDs (public) and secrets (private)

Public client IDs go in **wrangler.toml** under `[vars]`:

```toml
[vars]
GOOGLE_CLIENT_ID = "xxxxx.apps.googleusercontent.com"
GITHUB_CLIENT_ID = "Iv1.xxxxxxxx"
```

Secrets are set with Wrangler (never commit these):

```bash
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_SECRET        # any long random string, e.g. `openssl rand -hex 32`
```

## 4. Deploy

```bash
npm run build && wrangler deploy
```

Run the local safety checks first:

```bash
npm run check
```

> Note: this switches deployment from "upload static assets" to a Wrangler
> Worker deploy. Always `npm run build` first — wrangler serves the built
> `dist/`. After the first deploy, the Worker serves both the app (from
> `dist/`) and the `/api/*` backend.

The existing `wrangler.toml` binds Workers AI and the `savetome-library`
Vectorize index. For a fresh account, create an equivalent 1024-dimension cosine
index before deployment.

## 5. Verify

- Open https://saveto.me
- Sidebar footer shows **Sign in** -> pick Google or GitHub -> consent -> back to the app.
- Footer now shows your name/avatar. Add a bookmark, open the site in another
  browser, sign in — the bookmark is there.

---

## Local development

```bash
wrangler d1 execute d1savetome --local --file=./schema.sql
wrangler dev
```

Put local secrets in a `.dev.vars` file (git-ignored):

```
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_SECRET=...
SESSION_SECRET=dev-secret
```

## Notes

- Sessions are stateless signed JWTs in an HttpOnly, Secure, SameSite=Lax cookie (30 days).
- User data is stored **per bookmark** — one D1 `items` row each (`updated_at` +
  deletion tombstones), merged per row, plus a small versioned `settings` blob.
  This is the delta-sync model that avoids one device clobbering another; it scales
  to ~100k links. (The legacy single-blob `state` table is auto-migrated on first sync.)
- Opening the built `dist/index.html` directly (file://) or hosting `dist/` as pure
  static files (no Worker) keeps the app fully functional in local-only mode.
- The server owns sync timestamps, so a device clock set far into the future
  cannot freeze a bookmark.
- Pull sync is cursor-paginated; clients follow `nextCursor` until it is absent.
