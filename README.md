# saveme.to — Smart Bookmark Manager

A fast, in-browser bookmark manager. Paste a URL to save it; links are auto-tagged
and given a description from the domain, organized into **Projects** (folders), and
shown in compact/detailed and list/grid views. Everything runs client-side.

## Features (from the current prototype)
- **Quick save** — paste a URL in the top bar and press Enter.
- **Auto metadata** — heuristic tags + description generated from the domain/path.
- **Projects** — sidebar folders with live counts; add new projects on the fly.
- **Drag & drop** — drag a link card onto a project folder to move it.
- **Views** — Compact / Detailed × List / Grid.
- **Editable notes** — click a card's note to edit inline.
- **Search** — type (non-URL) text to filter by title, description, note, domain, or tag.
- **Save File** — export the whole app (with its data) to an `.html` file via the
  File System Access API.

## Known gaps / next steps
- **No persistence across reloads yet** — `items` live in memory; a refresh clears
  them. Planned: `localStorage` (privacy-first, no uploads).
- Favicons are fetched from Google's favicon service (only external request).
- No real page-title/description fetch (blocked by CORS client-side); currently
  derived from the URL.

## Run
Open `index.html` in a browser, or serve the folder:
```
cd ~/Desktop/saveme.to && python3 -m http.server 8080
```

## Deploy
Static site — deployable to Cloudflare Pages / GitHub Pages as-is (single file).

## Project rules
- Lives **only** at `~/Desktop/saveme.to/` with its own git remote.
- **Never** published to QNR Tools Hub or the script launcher.

## Stack
- Single-file HTML/CSS/JS. Plus Jakarta Sans. Indigo→violet brand
  (`#4F46E5 → #7C3AED`).
