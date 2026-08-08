# saveme.to — Project Instructions

## Overview
Smart bookmark manager, single-file static web app. Paste a URL → auto-tagged,
described, filed into Projects (folders). Compact/Detailed × List/Grid views,
inline-editable notes, drag-and-drop into folders, client-side search.

## Hard rules
- Lives **only** at `~/Desktop/saveme.to/` with its own git remote.
- **Never** publish to QNR Tools Hub or the script launcher.
- Static, in-browser, privacy-first — no uploads, no backend unless explicitly added.

## Structure
```
~/Desktop/saveme.to/
├── index.html   # entire app (HTML + CSS + JS in one file)
├── README.md
├── CLAUDE.md    # this file
└── .gitignore
```

## Design tokens
- Font: Plus Jakarta Sans.
- Brand gradient: `#4F46E5 → #7C3AED`; primary `#6366F1`; soft `#EEF2FF`.
- Radii: sm 8px, md 12px, lg 16px. Light theme (page `#F1F5F9`, cards `#FFFFFF`).

## Key JS (in index.html)
- State: `items[]`, `customProjects[]`, `activeFilter`, `currentLayout`,
  `currentDetailMode`, `draggedItemId`, `fileHandle`.
- `handleInput` — Enter on a `http(s)://` value creates an item.
- `generateLinkMetadata` — heuristic tags/description from domain+path.
- `renderItems` / `renderSidebarProjects` — DOM render + drag/drop wiring.
- `saveToDesktopFolder` — File System Access API export of the whole HTML.

## Open items
1. **Persistence** — add `localStorage` so links survive a reload (currently in-memory only).
2. Optional: real title/description fetch (needs a proxy/worker — CORS blocks client-side).
3. Optional: bring it up to beartimage-level polish (SEO, favicon, meta, deploy config).

## Testing checklist (after edits)
- [ ] Paste a URL + Enter saves a card with tags + description.
- [ ] Add project, drag a card into it, count updates.
- [ ] Compact/Detailed and List/Grid switches work.
- [ ] Note edits persist in-session; search filters correctly.
- [ ] No console errors.
