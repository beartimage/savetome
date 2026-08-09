# saveto.me — Accounts + Sync setup (Cloudflare)

This adds real sign-in (Google / GitHub) and per-user cloud sync on top of the
static app. The app still works with **no** backend — it silently stays in
local (IndexedDB) mode until the Worker below is deployed and you sign in.

Architecture:

```
Browser (public/index.html)
   |  /api/*                         everything else -> static assets
   v
Cloudflare Worker (worker.js)
   |  OAuth (Google/GitHub) + sessions (signed JWT cookie)
   v
D1 (SQLite)  ->  users + per-user state blob
```

You only need to do this once. Requires the Wrangler CLI:

```bash
npm install -g wrangler        # or: npx wrangler ...
wrangler login
```

---

## 1. Create the D1 database

```bash
cd ~/Desktop/saveto.me
wrangler d1 create savetome
```

Copy the printed `database_id` into **wrangler.toml** (replace
`PASTE_D1_DATABASE_ID_HERE`). Then create the tables:

```bash
wrangler d1 execute savetome --remote --file=./schema.sql
```

## 2. Create the OAuth apps

You need one per provider. The **redirect / callback URL** must be exactly:

```
https://savetome.savetome.workers.dev/api/auth/google/callback
https://savetome.savetome.workers.dev/api/auth/github/callback
```

(If you later add a custom domain, register that origin's callbacks too — the
Worker derives the redirect URI from the request origin automatically.)

**Google** — https://console.cloud.google.com/apis/credentials
- Create Credentials -> OAuth client ID -> *Web application*.
- Authorized redirect URI: the `.../google/callback` URL above.
- Configure the OAuth consent screen (External, add your email as a test user).
- Note the **Client ID** and **Client secret**.

**GitHub** — https://github.com/settings/developers -> New OAuth App
- Homepage URL: `https://savetome.savetome.workers.dev`
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
wrangler deploy
```

> Note: this switches deployment from "upload static assets" to a Wrangler
> Worker deploy. After the first `wrangler deploy`, the Worker serves both the
> app (from `public/`) and the `/api/*` backend.

## 5. Verify

- Open https://savetome.savetome.workers.dev
- Sidebar footer shows **Sign in** -> pick Google or GitHub -> consent -> back to the app.
- Footer now shows your name/avatar. Add a bookmark, open the site in another
  browser, sign in — the bookmark is there.

---

## Local development

```bash
wrangler d1 execute savetome --local --file=./schema.sql
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
- User data is stored as one JSON blob per user (matches the app's in-memory model). Simple and fast for a personal library; revisit per-row storage only past ~100k links.
- Opening `public/index.html` directly (file://) or hosting it as pure static
  files (no Worker) keeps the app fully functional in local-only mode.
