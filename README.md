# saveto.me — Personal Internet Library

A private library for everything worth keeping from the internet. Paste a URL or
use the browser extension; saveto.me stores it, extracts useful page content,
classifies it, finds duplicates, and makes it searchable by keywords or meaning.
The local-first app remains useful without an account; sign-in adds cloud sync and
server-side intelligence on Cloudflare.

## Features
- **Quick save** — paste a URL in the top bar and press Enter.
- **Auto-categorization and smart tags** — fast on-device classification immediately,
  followed by private server-side page enrichment when signed in.
- **Hybrid search** — D1 FTS5 full-text search and multilingual semantic similarity
  are combined into one ranked result set; keyword-only mode is one click away.
- **Duplicate detection** — catches normalized URL duplicates and same-content copies.
- **Ask My Library** — answers only from the signed-in user's indexed collection and
  returns clickable supporting sources.
- **Browser extension** — the Manifest V3 extension in `extension/` saves the active
  tab or a right-clicked link through the first-party saveto.me capture flow.
- **Projects** — sidebar folders with live counts. **Auto-created**: saving a link with no
  active folder makes a topical folder from its strongest tag (or domain). **Manual**
  folders are "priority" — they sort first and show a ★ star (auto ones show a folder).
- **Collapsible sidebar** — the brand-row chevron collapses it to an icon rail; the choice persists.
- **Drag & drop** — drag a link card onto a project folder to move it.
- **Views** — a single switch: **Lines** (compact list) or **Pinterest** (grid masonry with
  a website preview image + short description).
- **Editable notes** — click a card's note to edit inline.
- **Search** — searches title, extracted text, description, note, domain, folder, and tags.
- **Import / export** — settings gear (header) imports browser bookmark `.html` files
  (Chrome/Firefox/Safari/Edge — folders become projects) or a saveto.me `.json` backup, and
  exports as browser-importable HTML or full JSON. Duplicates are skipped on import.
- **Clickable pastel tags** — tags everywhere are colored text (one unified pastel palette,
  not pills); click one to filter. The sidebar shows the top 10; "Show all" opens a
  searchable tags modal.
- **Accessible themes** — Light, Dark, Green, Red, OLED, and Gold use semantic color
  tokens for backgrounds, text, icons, focus rings, tags, and controls. Contrast is
  regression-tested and the choice persists.
- **Privacy mode** — a Settings toggle that stops all external favicon/preview requests: favicons
  become local letter badges and the Pinterest view uses local placeholders, so saved URLs never
  reach Google or WordPress. Off by default; persists once enabled.
- **Accounts + cloud sync (optional)** — sign in with Google to sync your
  library across devices. Backed by a Cloudflare Worker + D1; the app still works
  fully local-only with no account. See **SETUP.md**.

## Storage and scale
- **Persistence: done** — links live in **IndexedDB** (`savemeDB`), loaded into memory on
  boot and written through on every change. Survives reloads; no 5 MB localStorage cap.
  First run starts with an empty private library. Signed in, each bookmark is
  synced as its own row in D1 (delta sync — see below).
- **Cloud sync: per-object delta sync** — each bookmark is an individual D1 row with its
  own `updated_at` (plus deletion tombstones); changes are merged **per row**, so editing
  on two devices at once no longer clobbers the whole library. There is **no 5 MB
  whole-library cap** — pushes are sent in bounded batches, so cloud sync scales with the
  same ~100k-link headroom as local storage (not "substantially less"). Projects/tags/view
  prefs travel as one small versioned settings blob.
- **Scale** — the list renders in **chunks of 80** (windowed / infinite scroll via an
  IntersectionObserver sentinel), so 100k+ links never build 100k DOM nodes at once.
  The sidebar tag list is capped to the **top 20** with a "Show all" toggle. Comfortable
  to ~100k links both fully client-side **and** synced to the cloud; beyond that, move to
  server-side search/pagination (Postgres + a search index).
- Favicons are fetched from Google's favicon service; website previews (in the
  Pinterest view) are fetched from WordPress mShots; and the Plus Jakarta Sans
  webfont is loaded from Google Fonts — all three send the URL/domain (and, for
  the font, your IP) to a third party. Signing in additionally uses Google/GitHub
  OAuth (opt-in). **Privacy mode** (Settings) turns off the favicon + preview
  requests entirely — favicons become local letter badges and previews become
  local placeholders — so nothing about your saved URLs leaves the browser (the
  one-time webfont still loads at page start; self-host it to remove that too).
  Apart from these, the tagger, storage, and search all run on-device.
- Signed-in enrichment is processed by the Worker with public-network SSRF guards,
  a strict response-size limit, sanitized text extraction, and per-user AI quotas.
  Sites that block automated fetches fall back to locally derived metadata.

## Run
Install deps then start the Vite dev server:
```
cd ~/Desktop/saveto.me && npm install && npm run dev
```
Production build lands in `dist/`: `npm run build`.

Run tests, the production build, and a Wrangler dry-run together with
`npm run check`.

## Deploy
Deployed as a **Cloudflare Worker**. Build first, then deploy — wrangler serves the
built `dist/`:
```
npm run build && npx wrangler deploy   # or: npm run deploy
```
The Worker (`worker.js`) serves the SPA from `dist/` and the `/api/*` accounts/sync
backend. One-time setup (OAuth apps, D1, secrets) is in **SETUP.md**. Without the
backend it is still a plain static site (any static host / GitHub Pages) in local-only mode.

## Project rules
- Lives **only** at `~/Desktop/saveto.me/` with its own git remote (`beartimage/savetome`).
- **Never** published to QNR Tools Hub or the script launcher.

## Stack
- SPA split into `index.html` (markup) + `src/app.js` (ES module) + `src/styles.css`,
  bundled by **Vite** into `dist/`; Plus Jakarta Sans throughout. A **Cloudflare Worker**
  serves assets and the API; D1 stores sync/search metadata, Workers AI generates
  multilingual embeddings and grounded answers, and Vectorize stores per-user vectors.
  **Two-tone dashboard
  theme** (SwiftHub reference) — dark navy sidebar with purple accent, orange count
  badges, and feather-style line icons on every row; light lavender-gray content area
  with white cards, purple `#6C5CE7` accents, and soft shadows. Six selectable themes.
