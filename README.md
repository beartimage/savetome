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

## Known gaps / next steps
- **Persistence: done** — links live in **IndexedDB** (`savemeDB`), loaded into memory on
  boot and written through on every change. Survives reloads; no 5 MB localStorage cap.
  First run seeds the store with the built-in sample links.
- **Scale** — the list renders in **chunks of 80** (windowed / infinite scroll via an
  IntersectionObserver sentinel), so 100k+ links never build 100k DOM nodes at once.
  The sidebar tag list is capped to the **top 20** with a "Show all" toggle. Comfortable
  to ~100k links fully client-side; beyond that needs a backend (Postgres + a search engine).
- Favicons are fetched from Google's favicon service; website previews (in the
  Pinterest view) are fetched from WordPress mShots — both send the URL/domain to a
  third party. These are the only external requests.
- No real page-title/description fetch (blocked by CORS client-side); title is
  derived from the URL and the description from the on-device classifier.

## Run
Open `index.html` in a browser, or serve the folder:
```
cd ~/Desktop/saveto.me && python3 -m http.server 8080
```

## Deploy
Static site — deployable to Cloudflare Pages / GitHub Pages as-is (single file).

## Project rules
- Lives **only** at `~/Desktop/saveto.me/` with its own git remote.
- **Never** published to QNR Tools Hub or the script launcher.

## Stack
- Single-file HTML/CSS/JS. Inter throughout. **Two-tone dashboard theme** (SwiftHub
  reference) — dark navy sidebar with purple accent, orange count badges, and feather-style
  line icons on every row; light lavender-gray content area with white cards, purple
  `#6C5CE7` accents, and soft shadows.
