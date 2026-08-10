# saveto.me — Smart Bookmark Manager

A fast, in-browser bookmark manager. Paste a URL to save it; links are auto-tagged
and given a description from the domain, organized into **Projects** (folders), and
shown in compact/detailed and list/grid views. Everything runs client-side.

## Features (from the current prototype)
- **Quick save** — paste a URL in the top bar and press Enter.
- **Smart tags (on-device)** — a curated domain knowledge base + keyword lexicon
  scores, dedupes, and normalizes tags and writes a short description. Fully in the
  browser, no backend or API key.
- **Projects** — sidebar folders with live counts. **Auto-created**: saving a link with no
  active project makes a topical project from its strongest tag (or domain). **Manual**
  projects are "priority" — they sort first and show a ★ star (auto ones show a folder).
- **Collapsible sidebar** — the brand-row chevron collapses it to an icon rail; the choice persists.
- **Drag & drop** — drag a link card onto a project folder to move it.
- **Views** — a single switch: **Lines** (compact list) or **Pinterest** (grid masonry with
  a website preview image + short description).
- **Editable notes** — click a card's note to edit inline.
- **Search** — type (non-URL) text to filter by title, description, note, domain, or tag.
- **Import / export** — settings gear (header) imports browser bookmark `.html` files
  (Chrome/Firefox/Safari/Edge — folders become projects) or a saveto.me `.json` backup, and
  exports as browser-importable HTML or full JSON. Duplicates are skipped on import.
- **Clickable pastel tags** — tags everywhere are colored text (one unified pastel palette,
  not pills); click one to filter. The sidebar shows the top 10; "Show all" opens a
  searchable tags modal.
- **Themes** — Light, Dark, Green, Red, Black (OLED), and Gold. Picker in the header ⋮ menu; choice persists.
- **Accounts + cloud sync (optional)** — sign in with Google to sync your
  library across devices. Backed by a Cloudflare Worker + D1; the app still works
  fully local-only with no account. See **SETUP.md**.

## Known gaps / next steps
- **Persistence: done** — links live in **IndexedDB** (`savemeDB`), loaded into memory on
  boot and written through on every change. Survives reloads; no 5 MB localStorage cap.
  First run seeds the store with the built-in sample links. Signed in, each bookmark is
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
  Pinterest view) are fetched from WordPress mShots — both send the URL/domain to a
  third party. These are the only external requests.
- No real page-title/description fetch (blocked by CORS client-side); title is
  derived from the URL and the description from the on-device classifier.

## Run
Install deps then start the Vite dev server:
```
cd ~/Desktop/saveto.me && npm install && npm run dev
```
Production build lands in `dist/`: `npm run build`.

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
- SPA split into `index.html` (markup) + `src/app.js` (all JS, ES module) + `src/styles.css`,
  bundled by **Vite** into `dist/`; Plus Jakarta Sans throughout. Optional Cloudflare Worker
  (`worker.js`) + D1 for accounts/sync. **Two-tone dashboard
  theme** (SwiftHub reference) — dark navy sidebar with purple accent, orange count
  badges, and feather-style line icons on every row; light lavender-gray content area
  with white cards, purple `#6C5CE7` accents, and soft shadows. Six selectable themes.
