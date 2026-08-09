# saveto.me — Project Instructions

## Overview
Smart bookmark manager, single-file static web app. Paste a URL → auto-tagged,
described, filed into Projects (folders). Compact/Detailed × List/Grid views,
inline-editable notes, drag-and-drop into folders, client-side search.

## Hard rules
- Lives **only** at `~/Desktop/saveto.me/` with its own git remote.
- **Never** publish to QNR Tools Hub or the script launcher.
- Static, in-browser, privacy-first — no uploads, no backend unless explicitly added.

## Structure
```
~/Desktop/saveto.me/
├── index.html   # entire app (HTML + CSS + JS in one file)
├── README.md
├── CLAUDE.md    # this file
└── .gitignore
```

## Design tokens
- Font: **Inter** everywhere (`--font-sans`; `--font-display` aliases it). No serif.
- Two-tone **SwiftHub dashboard** style: **dark navy sidebar AND dark navy top header** + **light lavender-gray content**.
  - Nav/header vars: `--nav-bg #171A2E`, `--nav-panel`, `--nav-text`, `--nav-muted`, `--nav-border`, `--nav-active-bg #2A2E52`, `--nav-active-text #9184F6` (purple), `--nav-icon`. The top header (search, sort, view switcher, settings gear) uses the same dark palette as the sidebar — active pills are indigo `--nav-active-bg` with purple text.
  - Content vars: page `#ECECF2`, white cards, purple accent `--brand-primary #6C5CE7`, navy text `#1C2033`.
- **Tags & counts are colored, clickable TEXT — never filled pills/buttons.** Card tags/project tag click to filter; a subtle × (hover) removes. Sidebar tag list uses bright hue variants (`.tag-nav.tag-*`) legible on dark navy; the searchable all-tags modal uses darker variants (`.tags-modal-list .tag-nav.tag-*`) for the light card. Count badges (`.badge`) are plain orange text (`--badge-bg #F97539`), not pills.
- Radii: sm 8 / md 12 / lg 16.
- **Line icons everywhere** (feather-style inline SVG): `ICONS` object (folder, hash, edit, trash, **star**) + inline SVG (shield brand, bookmark, plus, settings gear, sidebar-collapse chevron).
- **Two views only** — a single icon switcher: **Lines** (`btnLines` → list + compact) and **Pinterest** (`btnPinterest` → grid + detailed masonry). `setView('lines'|'pinterest')` sets both `currentLayout` + `currentDetailMode`. The old Compact/Detailed + List/Grid text buttons were removed.
- **Collapsible sidebar** — `toggleSidebar()` adds `body.sidebar-collapsed` (icon-only 76px rail: labels/badges/search/tags hidden, nav rows become centered 46px rounded tiles, section dividers). Toggle is the brand-row chevron (`#sidebarToggle`); preference persists in `localStorage('savemeSidebarCollapsed')` and is restored on boot.

## Projects — auto-create + priority
- **Auto-created projects**: on save with no active project filter, `inferProjectName(autoTags, domain)` picks the strongest non-"web" tag (Title Cased) or falls back to the prettified domain; `ensureProject(name, false)` adds it (folder icon). Import folders also create non-priority projects.
- **Priority (manual) projects**: `addNewProject()` and any user-named project go through `ensureProject(name, true)` → tracked in the `priorityProjects` Set. In the sidebar they sort first and show a **star** icon; auto projects show a **folder**. `renameProject`/`deleteProject` maintain the Set; persisted in `meta` store key `priorityProjects` (loaded in `initStore`).

## Persistence & scale
- **IndexedDB** (`savemeDB`, v1): store `links` (keyPath `id`; indexes `project`,
  `domain`, multiEntry `tags`) + store `meta` (`customProjects`). `initStore()` opens the
  DB on boot, loads `items` into memory (falls back to in-memory if IDB is unavailable),
  and **seeds** with the built-in samples on first run. Mutations write through with
  targeted helpers — `dbPut`/`dbPutMany`/`dbDelete`/`dbDeleteMany`/`dbSaveProjects` — never
  rewriting the whole store.
- **Chunked rendering** — `renderItems` sets `_visible` then `renderNextChunk()` appends
  `CHUNK` (80) cards at a time; an IntersectionObserver on a `#scroll-sentinel` (sibling of
  `#linkList` inside `.content-scroll`, `rootMargin:600px`) loads the next batch. Any
  filter/sort/search resets to batch 1, keeping the DOM small. Masonry-safe (no height
  measurement). `buildCard(item)` builds one card DOM node.
- **Sidebar tags** capped to top `TAG_LIMIT` (10) by count. **"Show all N tags"** opens a searchable modal (`openTagsModal`/`closeTagsModal`/`onTagsSearch`/`renderTagsModal`, overlay `#tagsOverlay`, search `#tagsSearch`, list `#tagsModalList`) — click a tag there to filter and close. (`showAllTags` is legacy/unused.)
- **Sidebar projects** capped to top `PROJECT_LIMIT` (20) by count via a single O(N) count `Map`
  (never O(projects × links)); `#projectSearch` box + `onProjectSearch`/`projectQuery` filters,
  `showAllProjects` toggle. Scales to 10k+ projects.

## Settings — import / export (gear button in header)
- `openSettings`/`closeSettings` toggle `#settingsOverlay` (Escape closes).
- `exportHTML()` writes a **Netscape Bookmark File** (folders = projects) that any browser imports;
  `exportJSON()` writes a full `{version,exportedAt,projects,items}` backup.
- `handleImportFile` reads a `.html` (Chrome/Firefox/Safari/Edge) or `.json` backup;
  `importBookmarksHTML` (DOMParser, `h3`→folder/project, `a[href]` links, skips non-http) and
  `importJSON` both funnel into `ingestLinks()` — dedupe by `normalizeUrl`, fill missing metadata via
  `generateLinkMetadata`, create any new projects, `dbPutMany`, refresh.

## Key JS (in index.html)
- State: `items[]`, `customProjects[]`, `activeFilter`, `currentLayout`,
  `currentDetailMode`, `draggedItemId`.
- `handleInput` — Enter on a `http(s)://` value creates an item.
- `generateLinkMetadata` — **smart on-device classifier**: curated `KNOWN_DOMAINS`
  map + `KEYWORD_RULES` lexicon, weighted/scored/deduped tags (cap 4), normalized
  casing (`TAG_CASE`), smart description. No backend/API.
- `getTagColorClass` — category regex → `.tag-*` color + stable hash fallback palette.
- `activateThumbs` — lazily loads website-preview `src` (WordPress mShots) only in
  the Pinterest view (grid + detailed); gradient tile fallback on error.
- `renderItems` / `renderSidebarProjects` — DOM render + drag/drop wiring.

## Views
- Compact/Detailed × List/Grid. **Grid + Detailed = Pinterest masonry** (CSS
  `columns`) with website preview image + short description.

## Open items
1. ~~Persistence~~ — **done** (IndexedDB, see above).
2. Optional: real title/description fetch (needs a proxy/worker — CORS blocks client-side).
3. Optional: opt-in real-LLM tagging (Cloudflare Worker + API key) — declined for now to stay backend-free.
4. Privacy: previews send full URL to WordPress mShots; favicons send domain to Google.
5. Beyond ~100k links: move data server-side (Postgres + Meilisearch/Typesense, cursor pagination, per-user sharding).

## Testing checklist (after edits)
- [ ] Paste a URL + Enter saves a card with tags + description.
- [ ] Add project, drag a card into it, count updates.
- [ ] Compact/Detailed and List/Grid switches work.
- [ ] Note edits persist in-session; search filters correctly.
- [ ] No console errors.
