import { htmlAttr, jsAttr, esc, safeUrl, safeHttpUrl, safeColor, normalizeUrl, analyzeImportCandidates, consolidateDuplicateLinks, analyzeLocalLinkHealth, buildSyncBatches, decideRemoteSync, isSyncSnapshotCurrent, itemTimestamp, timeAgo, titleCase } from './util.js';
import { recordTagOverride, hostMatchesPattern, normalizeTag, prettifyTitle, generateLinkMetadata, getTagColorClass } from './classifier.js';
import { conceptAliasesForToken, normalizeSearchConcept } from './search-concepts.js';

    let currentLayout = 'list';
    let currentDetailMode = 'compact';
    let activeFilter = null;        // project filter
    let activeTags = [];            // tag filter — multi-select (composes with project)
    let tagMode = 'or';             // 'or' = match ANY tag, 'and' = match ALL
    let searchQuery = '';
    let hybridSearchEnabled = true;
    try { hybridSearchEnabled = localStorage.getItem('savemeHybridSearch') !== '0'; } catch (e) {}
    const librarySearch = { query: '', results: [], ready: false, loading: false, controller: null };
    let lastLibraryAskQuestion = '';
    let librarySearchTimer = null;
    let enrichmentRunning = false;
    let currentSort = 'newest';
    let draggedItemId = null;
    let dragKind = null;            // 'card' | 'project' | 'tag' — what is being dragged
    let draggedName = null;         // project/tag name being dragged
    let projectParent = {};         // child folder id -> parent folder id
    let folders = {};               // folder id -> stable folder entity (schema v3)
    let projectCollapsed = new Set();// collapsed parent projects
    // Finder list disclosure is view-local UI state. Keep it separate from the
    // legacy synced projectCollapsed value so old backups cannot invert it.
    let finderExpanded = new Set();  // folder ids expanded inline in the main list
    let tagOrder = [];              // manual tag order (names)
    let showAllTags = false;        // (legacy — tags now expand via modal)
    const TAG_LIMIT = 10;           // top-N tags in sidebar before "Show all" modal
    let showAllProjects = false;    // sidebar project list expand/collapse
    let projectQuery = '';          // sidebar project search box
    const PROJECT_LIMIT = 20;       // top-N projects shown before "Show all"
    let pinnedView = false;         // "Pinned" library view — only pinned links
    let recentView = false;         // "Recently Added" library view — newest first
    const RECENT_LIMIT = 50;        // how many newest links "Recently Added" shows
    let recentWindow = 0;           // Recently Added time filter in days (0 = all)
    let recentShowAll = false;      // false = first 50; true = entire selected time window
    let projectMeta = {};           // project name -> { icon, emoji, color }
    // Privacy mode: when on, the app makes NO external requests for link icons or
    // page previews — favicons render as local letter badges and the Pinterest
    // view shows a local placeholder. Saved URLs never reach Google/WordPress.
    let privacyMode = false;
    try { privacyMode = localStorage.getItem('savemePrivacy') === '1'; } catch (e) {}
    const DAY_MS = 86400000;

    // --- Small shared helpers ---------------------------------------------------
    let toastTimer = null;
    function showToast(msg, undoFn) {
      let t = document.getElementById('toast');
      if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
      t.innerHTML = '';
      const label = document.createElement('span');
      label.textContent = msg;
      t.appendChild(label);
      if (typeof undoFn === 'function') {
        const btn = document.createElement('button');
        btn.className = 'toast-undo';
        btn.textContent = 'Undo';
        btn.onclick = () => { t.classList.remove('show'); if (toastTimer) clearTimeout(toastTimer); undoFn(); };
        t.appendChild(btn);
      }
      t.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove('show'), undoFn ? 6000 : 2200);
    }
    // Human "saved X ago" — itemTimestamp/timeAgo live in util.js.
    function tagActive(t) { return activeTags.some(x => x.toLowerCase() === t.toLowerCase()); }
    function flashItem(id) {
      const el = document.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }

    // New libraries start empty. The legacy URL map is retained only so older
    // installations can remove the original demo records without touching real links.
    const LEGACY_DEMO_URLS = new Map([
      [1, "https://dribbble.com/shots/26940926-Bloggo"],
      [2, "https://supabase.com"],
      [3, "https://github.com"],
      [4, "https://stackoverflow.com/questions/tagged/css-grid"],
      [5, "https://developer.mozilla.org/en-US/docs/Web/CSS/columns"],
      [6, "https://www.figma.com/community"],
      [7, "https://www.notion.so/product"],
      [8, "https://news.ycombinator.com"],
      [9, "https://en.wikipedia.org/wiki/Masonry_(design)"],
      [10, "https://www.youtube.com/watch?v=jV8B24rSN5o"],
      [11, "https://tailwindcss.com/docs"],
      [12, "https://vercel.com"],
      [13, "https://www.cloudflare.com/developer-platform/pages/"],
      [14, "https://fonts.google.com/specimen/Inter"],
      [15, "https://feathericons.com"],
      [16, "https://coolors.co"],
      [17, "https://unsplash.com"],
      [18, "https://www.behance.net"],
      [19, "https://developer.apple.com/design/human-interface-guidelines"],
      [20, "https://react.dev"],
      [21, "https://nodejs.org/en/docs"],
      [22, "https://www.postgresql.org/docs/"],
      [23, "https://caniuse.com/css-has"],
      [24, "https://css-tricks.com/piecing-together-approaches-for-a-css-masonry-layout/"],
      [25, "https://www.smashingmagazine.com/category/design"],
      [26, "https://www.awwwards.com"],
      [27, "https://developer.chrome.com/docs/devtools"],
      [28, "https://web.dev/learn/css"],
      [29, "https://www.google.com/search?q=on-device+text+classification"],
      [30, "https://huggingface.co/models"],
      [31, "https://openai.com/blog"],
      [32, "https://www.anthropic.com/news"],
      [33, "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API"],
      [34, "https://www.reddit.com/r/webdev/"],
      [35, "https://medium.com/tag/frontend-development"],
      [36, "https://www.producthunt.com"],
      [37, "https://linear.app"],
      [38, "https://www.canva.com"],
      [39, "https://css-tricks.com/almanac/properties/c/column-fill/"],
      [40, "https://www.pinterest.com/search/pins/?q=dashboard%20ui"],
      [41, "https://www.typescriptlang.org/docs/"],
      [42, "https://vitejs.dev"],
      [43, "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog"],
      [44, "https://www.deque.com/axe/"],
      [45, "https://realfavicongenerator.net"],
      [46, "https://squoosh.app"],
      [47, "https://excalidraw.com"],
      [48, "https://www.wappalyzer.com"],
      [49, "https://caniemail.com"],
      [50, "https://www.figma.com/blog/"]
    ]);
    let customProjects = [];
    let priorityProjects = new Set();
    let items = [];
    let lastImportBatchId = null;

    const FOLDER_SCHEMA_VERSION = 3;
    function newFolderId() {
      if (crypto.randomUUID) return `fld_${crypto.randomUUID()}`;
      const bytes = new Uint32Array(4); crypto.getRandomValues(bytes);
      return `fld_${[...bytes].map(n => n.toString(16).padStart(8, '0')).join('')}`;
    }
    function cleanFolderName(value) {
      return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 80);
    }
    function folderName(id) { return folders[id]?.name || String(id || ''); }
    function folderEntity(id) { return folders[id] || null; }
    function folderKind(id) { return folders[id]?.kind || 'legacy'; }
    function folderByName(name, parentId = undefined) {
      const wanted = cleanFolderName(name).toLocaleLowerCase();
      return Object.values(folders).find(folder => folder.name.toLocaleLowerCase() === wanted &&
        (parentId === undefined || (folder.parentId || null) === (parentId || null))) || null;
    }
    function createFolderEntity(name, options = {}) {
      const clean = cleanFolderName(name);
      if (!clean) return null;
      const parentId = options.parentId || null;
      const existing = options.reuseSibling === false ? null : folderByName(clean, parentId);
      if (existing) return existing;
      const id = options.id && !folders[options.id] ? options.id : newFolderId();
      const now = Date.now();
      const folder = { id, name: clean, parentId, kind: options.kind || 'manual', source: options.source || null,
        importBatchId: options.importBatchId || null, allowSmartAssignment: options.allowSmartAssignment !== false,
        createdAt: options.createdAt || now, updatedAt: now };
      folders[id] = folder;
      if (!customProjects.includes(id)) customProjects.push(id);
      if (parentId) projectParent[id] = parentId;
      return folder;
    }
    function syncFolderParents() {
      projectParent = {};
      for (const folder of Object.values(folders)) if (folder.parentId && folders[folder.parentId]) projectParent[folder.id] = folder.parentId;
    }
    function validateFolderGraph(candidate = folders) {
      const visiting = new Set(), visited = new Set();
      const visit = id => {
        if (visited.has(id)) return;
        if (visiting.has(id)) throw new Error('Folder hierarchy contains a cycle');
        visiting.add(id);
        const parentId = candidate[id]?.parentId;
        if (parentId) {
          if (!candidate[parentId]) throw new Error(`Folder parent is missing: ${parentId}`);
          visit(parentId);
        }
        visiting.delete(id); visited.add(id);
      };
      Object.keys(candidate).forEach(visit);
      return true;
    }
    function migrateLegacyFolders() {
      if (Object.keys(folders).length) {
        syncFolderParents();
        const browserRoots = Object.values(folders).filter(folder => !folder.parentId && / (?:Favorites|Browser)$/i.test(folder.name));
        const changed = [];
        let inboxFolder = null;
        const browserRootFor = item => {
          if (item.importRootId && folders[item.importRootId]) return folders[item.importRootId];
          const namedRoot = cleanFolderName(item.importRoot);
          if (namedRoot) {
            const exact = browserRoots.find(folder => folder.name.toLocaleLowerCase() === namedRoot.toLocaleLowerCase());
            if (exact) return exact;
          }
          const source = cleanFolderName(item.source || item.browser || '').toLocaleLowerCase();
          if (source) {
            const bySource = browserRoots.find(folder => cleanFolderName(folder.source).toLocaleLowerCase() === source);
            if (bySource) return bySource;
          }
          return (item.imported === true || item.folderSource === 'browser-import') && browserRoots.length === 1 ? browserRoots[0] : null;
        };
        const matchingLegacyFolder = (item, root) => {
          const names = [item.projectName, item.project]
            .map(cleanFolderName)
            .filter(name => name && !/^fld_/i.test(name));
          for (const name of names) {
            const matches = Object.values(folders).filter(folder =>
              folder.name.toLocaleLowerCase() === name.toLocaleLowerCase() &&
              (!root || folder.id === root.id || isDescendant(folder.id, root.id)));
            if (matches.length === 1) return matches[0];
          }
          return null;
        };
        for (const item of items) {
          let target = item.folderId && folders[item.folderId] ? folders[item.folderId]
            : (folders[item.project] ? folders[item.project] : null);
          if (!target) {
            const root = browserRootFor(item);
            target = matchingLegacyFolder(item, root) || root;
          }
          if (!target) {
            inboxFolder ||= folderByName('Inbox', null) || createFolderEntity('Inbox', { kind: 'system' });
            target = inboxFolder;
          }
          if (item.folderId !== target.id || item.project !== target.id || item.projectName !== target.name) {
            item.folderId = target.id;
            item.project = target.id;
            item.projectName = target.name;
            if (target.kind === 'browser-import') {
              const root = browserRootFor(item) || (target.parentId ? folders[target.parentId] : target);
              item.importRootId = root?.id || item.importRootId || null;
              item.importRoot = root?.name || item.importRoot || null;
              item.folderSource = 'browser-import';
            }
            changed.push(item);
          }
        }
        return changed.length > 0;
      }
      const names = [...new Set([...customProjects, ...items.map(item => item.project), ...Object.keys(projectParent), ...Object.values(projectParent)].filter(Boolean))];
      if (!names.length) return false;
      const oldParents = { ...projectParent };
      const idByName = new Map();
      for (const name of names) {
        const folder = createFolderEntity(name, { kind: items.some(item => item.project === name && item.folderSource === 'browser-import') ? 'browser-import' : 'manual' });
        idByName.set(name, folder.id);
      }
      for (const [child, parent] of Object.entries(oldParents)) {
        const childId = idByName.get(child), parentId = idByName.get(parent);
        if (childId && parentId && childId !== parentId) folders[childId].parentId = parentId;
      }
      customProjects = names.map(name => idByName.get(name)).filter(Boolean);
      priorityProjects = new Set([...priorityProjects].map(name => idByName.get(name)).filter(Boolean));
      projectCollapsed = new Set([...projectCollapsed].map(name => idByName.get(name)).filter(Boolean));
      projectMeta = Object.fromEntries(Object.entries(projectMeta).map(([name, meta]) => [idByName.get(name), meta]).filter(([id]) => id));
      for (const item of items) {
        const folderId = idByName.get(item.project);
        if (folderId) { item.folderId = folderId; item.project = folderId; item.projectName = folderName(folderId); }
      }
      syncFolderParents(); validateFolderGraph();
      return true;
    }

    function migrateBrowserRootNames() {
      const renameMap = {
        'Edge Favorites': 'Edge Browser',
        'Chrome Favorites': 'Chrome Browser',
        'Safari Favorites': 'Safari Browser',
        'Firefox Favorites': 'Firefox Browser',
        'Brave Favorites': 'Brave Browser',
        'Opera Favorites': 'Opera Browser',
        'Vivaldi Favorites': 'Vivaldi Browser',
        'Browser Favorites': 'Other Browser'
      };
      const changedItems = new Set();
      let changedFolders = false;
      for (const folder of Object.values(folders)) {
        const oldName = folder.name;
        const nextName = renameMap[oldName];
        if (!nextName) continue;
        folder.name = nextName;
        folder.source = nextName.replace(/ Browser$/, '').toLowerCase();
        folder.updatedAt = Date.now();
        changedFolders = true;
        for (const item of items) {
          if ((item.folderId || item.project) === folder.id) { item.projectName = nextName; changedItems.add(item); }
          if (item.importRootId === folder.id || item.importRoot === oldName) { item.importRoot = nextName; changedItems.add(item); }
        }
      }
      if (changedItems.size) dbPutMany([...changedItems]);
      if (changedFolders) dbSaveProjects();
      return changedFolders;
    }

    // Very old browser imports used a root-level technical bucket named
    // "Imported". Once a single browser Favorites root is known, merge that
    // bucket into the browser root instead of exposing an implementation name
    // as if the user had created it. Links are preserved; only their folder id
    // and import provenance are repaired.
    function repairStableImportedBucket() {
      const imported = Object.values(folders).find(folder => folder.name === 'Imported' && !folder.parentId);
      const browserRoots = Object.values(folders).filter(folder => !folder.parentId && / (?:Favorites|Browser)$/i.test(folder.name));
      if (!imported || browserRoots.length !== 1 || priorityProjects.has(imported.id)) return false;
      const root = browserRoots[0];
      const moved = items.filter(item => (item.folderId || item.project) === imported.id);
      if (!moved.length) return false;
      for (const item of moved) {
        item.folderId = root.id;
        item.project = root.id;
        item.projectName = root.name;
        item.imported = true;
        item.folderSource = 'browser-import';
        item.importRoot = root.name;
        item.importRootId = root.id;
      }
      for (const folder of Object.values(folders)) {
        if (folder.parentId === imported.id) {
          folder.parentId = root.id;
          projectParent[folder.id] = root.id;
        }
      }
      delete folders[imported.id]; delete projectParent[imported.id]; delete projectMeta[imported.id];
      customProjects = customProjects.filter(id => id !== imported.id);
      projectCollapsed.delete(imported.id);
      if (activeFilter === imported.id) activeFilter = root.id;
      dbPutMany(moved);
      dbSaveProjects();
      return true;
    }

    function updateContainerClasses() {
      const container = document.getElementById('linkList');
      container.className = `view-${currentLayout} mode-${currentDetailMode}`;
      activateThumbs();
    }

    // Only fetch website previews once the Pinterest (grid + detailed) view is open.
    function activateThumbs() {
      if (!(currentLayout === 'grid' && currentDetailMode === 'detailed')) return;
      document.querySelectorAll('.item-thumb[data-src]').forEach(img => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      });
    }

    // Two views only: "lines" (list + compact) and "pinterest" (grid + detailed masonry).
    function setView(view) {
      const previousLayout = currentLayout;
      const previousDetailMode = currentDetailMode;
      if (view === 'pinterest') { currentLayout = 'grid'; currentDetailMode = 'detailed'; }
      else { view = 'lines'; currentLayout = 'list'; currentDetailMode = 'compact'; }
      document.getElementById('btnPinterest').classList.toggle('active', view === 'pinterest');
      document.getElementById('btnLines').classList.toggle('active', view === 'lines');
      // List and Pinterest use different DOM structures: the list is a Finder
      // tree-table, while Pinterest keeps the existing visual cards.
      if (previousLayout !== currentLayout || previousDetailMode !== currentDetailMode) refresh();
      else updateContainerClasses();
      // A list and a masonry grid have unrelated vertical geometry. Keeping the
      // old scroll offset can land a phone in the middle of a large preview.
      if (previousLayout !== currentLayout || previousDetailMode !== currentDetailMode) {
        const scroller = document.querySelector('.content-scroll');
        if (scroller) scroller.scrollTop = 0;
      }
    }

    // Collapse the sidebar to an icon rail; preference persists across reloads.
    function toggleSidebar() {
      // On mobile the sidebar is an off-canvas drawer — the chevron just closes it.
      if (isMobileNav()) { closeNav(); return; }
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      const btn = document.getElementById('sidebarToggle');
      if (btn) {
        btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      }
      try { localStorage.setItem('savemeSidebarCollapsed', collapsed ? '1' : '0'); } catch (e) {}
    }

    // ---- Mobile navigation drawer ----
    const mobileNavMedia = window.matchMedia('(max-width: 820px)');
    let mobileDrawerReturnFocus = null;
    let mobileDrawerInertState = null;

    function isMobileNav() { return mobileNavMedia.matches; }
    function mobileDrawer() { return document.getElementById('libraryDrawer'); }
    function mobileDrawerTriggers() {
      return [document.getElementById('navToggle'), document.getElementById('mobileLibraryToggle')].filter(Boolean);
    }
    function setMobileDrawerControls(open) {
      mobileDrawerTriggers().forEach(button => button.setAttribute('aria-expanded', open ? 'true' : 'false'));
      const drawer = mobileDrawer();
      if (drawer) drawer.inert = isMobileNav() ? !open : false;
      const closeButton = document.getElementById('sidebarToggle');
      if (!closeButton) return;
      if (isMobileNav()) {
        closeButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        closeButton.setAttribute('aria-label', open ? 'Close library navigation' : 'Open library navigation');
        closeButton.title = open ? 'Close library navigation' : 'Open library navigation';
      } else {
        const expanded = !document.body.classList.contains('sidebar-collapsed');
        closeButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        closeButton.setAttribute('aria-label', expanded ? 'Collapse sidebar' : 'Expand sidebar');
        closeButton.title = expanded ? 'Collapse sidebar' : 'Expand sidebar';
      }
      updateMobileDockState();
    }
    function setMobileDrawerBackgroundInert(open) {
      const targets = [document.getElementById('main-content'), document.querySelector('.mobile-tabbar')].filter(Boolean);
      if (open) {
        if (!mobileDrawerInertState) mobileDrawerInertState = new Map(targets.map(element => [element, element.inert]));
        targets.forEach(element => { element.inert = true; });
        return;
      }
      if (!mobileDrawerInertState) return;
      mobileDrawerInertState.forEach((wasInert, element) => { element.inert = wasInert; });
      mobileDrawerInertState = null;
    }
    function mobileDrawerFocusable() {
      const drawer = mobileDrawer();
      if (!drawer) return [];
      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
      return [...drawer.querySelectorAll(selector)].filter(element => {
        if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.closest('[inert]')) return false;
        if (element.closest('.nav-section.collapsed .nav-section-body')) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.getClientRects().length > 0;
      });
    }
    function focusMobileDrawer() {
      window.requestAnimationFrame(() => {
        if (!document.body.classList.contains('nav-open')) return;
        const drawer = mobileDrawer();
        const target = document.getElementById('sidebarToggle') || mobileDrawerFocusable()[0] || drawer;
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
      });
    }
    function toggleNav() {
      if (document.body.classList.contains('nav-open')) closeNav(); else openNav();
    }
    function openNav() {
      if (!isMobileNav() || document.body.classList.contains('nav-open')) return;
      const drawer = mobileDrawer();
      const active = document.activeElement;
      if (active && (!drawer || !drawer.contains(active)) && typeof active.focus === 'function') mobileDrawerReturnFocus = active;
      document.body.classList.add('nav-open');
      setMobileDrawerControls(true);
      setMobileDrawerBackgroundInert(true);
      focusMobileDrawer();
    }
    function closeNav(options = {}) {
      const wasOpen = document.body.classList.contains('nav-open');
      if (!wasOpen && !mobileDrawerInertState) return;
      const restoreFocus = options.restoreFocus !== false;
      const returnTarget = mobileDrawerReturnFocus;
      document.body.classList.remove('nav-open');
      setMobileDrawerBackgroundInert(false);
      setMobileDrawerControls(false);
      mobileDrawerReturnFocus = null;
      if (wasOpen && restoreFocus) {
        window.requestAnimationFrame(() => {
          const fallback = document.getElementById('navToggle') || document.getElementById('mobileLibraryToggle');
          const target = returnTarget && returnTarget.isConnected ? returnTarget : fallback;
          if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
        });
      }
    }
    function focusLibrarySearch(mode = 'search') {
      closeNav();
      closeHeaderMenu();
      const input = document.getElementById('searchInput');
      if (!input) return;
      input.placeholder = mode === 'add' ? 'Paste a URL to save…' : 'Search, paste a URL, or ask…';
      input.focus({ preventScroll: true });
      if (mode === 'add') {
        input.select();
        showToast('Paste a URL to save it');
      }
    }
    // Tapping a folder/link/nav row inside the drawer closes it (but not accordion carets).
    document.addEventListener('DOMContentLoaded', () => {
      const aside = document.querySelector('aside');
      if (aside) aside.addEventListener('click', (e) => {
        if (!isMobileNav() || !document.body.classList.contains('nav-open')) return;
        if (e.target.closest('.proj-caret') || e.target.closest('.acc-header')) return;
        if (e.target.closest('.nav-item') || e.target.closest('.profile-login')) closeNav();
      });
      setMobileDrawerControls(document.body.classList.contains('nav-open'));
    });
    document.addEventListener('keydown', (e) => {
      if (!isMobileNav() || !document.body.classList.contains('nav-open')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeNav();
        return;
      }
      if (e.key !== 'Tab') return;
      const drawer = mobileDrawer();
      const focusable = mobileDrawerFocusable();
      if (!drawer || !focusable.length) {
        e.preventDefault();
        drawer?.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!drawer.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (e.shiftKey && (active === first || active === drawer)) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
    const syncMobileDrawerViewport = () => {
      if (!isMobileNav()) {
        closeNav({ restoreFocus: false });
        setMobileDrawerControls(false);
      } else {
        setMobileDrawerControls(document.body.classList.contains('nav-open'));
      }
      updateAppThemeColor();
    };
    if (mobileNavMedia.addEventListener) mobileNavMedia.addEventListener('change', syncMobileDrawerViewport);
    else mobileNavMedia.addListener(syncMobileDrawerViewport);

    // ---- Application modal focus manager ------------------------------------
    // All app dialogs use the same lifecycle so keyboard focus cannot escape to
    // the library behind them. The stack also covers async hand-offs such as
    // Settings -> confirmation -> Settings and Sign out -> confirmation.
    const MODAL_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
    const MOBILE_DOCK_DIALOGS = new Map([
      ['saveLinkOverlay', 'mobileSaveTab'],
      ['libraryAskOverlay', 'mobileAskTab'],
      ['settingsOverlay', 'mobileSettingsTab']
    ]);
    const modalFocusStack = [];
    let modalBackgroundInertState = null;
    let modalLastExternalFocus = null;
    let modalFocusObserver = null;

    function modalFocusableElements(overlay) {
      if (!overlay) return [];
      return [...overlay.querySelectorAll(MODAL_FOCUSABLE)].filter(element => {
        if (element.hidden || element.closest('[hidden]') || element.closest('[inert]')) return false;
        if (element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && element.getClientRects().length > 0;
      });
    }

    function normalizeModalOpener(element) {
      if (!element || !element.closest) return element;
      const headerMenu = element.closest('.header-menu-dropdown')?.closest('.header-menu');
      if (headerMenu) return headerMenu.querySelector('button[aria-haspopup]') || element;
      if (element.closest('#cmdkOverlay')) return document.getElementById('searchInput') || element;
      if (isMobileNav() && element.closest('#libraryDrawer')) {
        return document.getElementById('mobileLibraryToggle') || document.getElementById('navToggle') || element;
      }
      return element;
    }

    function canRestoreModalFocus(element) {
      if (!element || !element.isConnected || !element.closest) return false;
      if (element.closest('[inert]') || element.closest('[hidden]') || element.closest('.modal-overlay[aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    }

    function modalBackgroundTargets() {
      return [
        document.getElementById('libraryDrawer'),
        document.getElementById('main-content'),
        document.querySelector('.mobile-tabbar'),
        document.getElementById('navBackdrop'),
        document.getElementById('cmdkOverlay')
      ].filter(Boolean);
    }

    function setModalBackgroundInert(inert) {
      const targets = modalBackgroundTargets();
      if (inert) {
        if (!modalBackgroundInertState) {
          modalBackgroundInertState = new Map(targets.map(element => [element, element.inert]));
        }
        targets.forEach(element => { element.inert = true; });
        return;
      }
      if (!modalBackgroundInertState) return;
      modalBackgroundInertState.forEach((wasInert, element) => {
        if (element.isConnected) element.inert = wasInert;
      });
      modalBackgroundInertState = null;
    }

    function updateMobileDockState() {
      const dock = document.querySelector('.mobile-tabbar');
      if (!dock) return;
      const buttons = [...dock.querySelectorAll('.mobile-tab')];
      buttons.forEach(button => {
        button.classList.remove('active');
        button.removeAttribute('aria-current');
      });
      MOBILE_DOCK_DIALOGS.forEach((buttonId, overlayId) => {
        const button = document.getElementById(buttonId);
        const expanded = document.getElementById(overlayId)?.classList.contains('show') || false;
        if (button) button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });

      const activeDialog = [...modalFocusStack].reverse().find(entry => MOBILE_DOCK_DIALOGS.has(entry.overlay.id));
      let activeButton = activeDialog ? document.getElementById(MOBILE_DOCK_DIALOGS.get(activeDialog.overlay.id)) : null;
      if (!activeButton && document.body.classList.contains('nav-open')) activeButton = document.getElementById('mobileLibraryToggle');
      if (!activeButton && document.activeElement === document.getElementById('searchInput')) activeButton = document.getElementById('mobileSearchTab');
      if (!activeButton) {
        activeButton = document.getElementById('mobileLibraryToggle');
        activeButton?.setAttribute('aria-current', 'page');
      }
      activeButton?.classList.add('active');
    }

    function focusTopModal(entry, preferredTarget = null) {
      window.requestAnimationFrame(() => {
        const top = modalFocusStack[modalFocusStack.length - 1];
        if (!entry || top !== entry || !entry.overlay.classList.contains('show')) return;
        const focusable = modalFocusableElements(entry.overlay);
        let target = preferredTarget;
        if (!target || !target.isConnected || !entry.overlay.contains(target) || target.closest('[inert]')) {
          target = entry.overlay.querySelector('[autofocus]');
        }
        if (!target || !focusable.includes(target)) {
          target = focusable.find(element => !element.classList.contains('modal-close') && !element.classList.contains('onboarding-close')) || focusable[0];
        }
        if (!target) {
          target = entry.overlay.querySelector('[role="dialog"]');
          if (target && !target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        }
        if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
      });
    }

    function restoreModalFocus(target) {
      window.requestAnimationFrame(() => {
        let next = normalizeModalOpener(target);
        if (!canRestoreModalFocus(next)) next = normalizeModalOpener(modalLastExternalFocus);
        if (!canRestoreModalFocus(next)) {
          next = [
            document.getElementById('mobileLibraryToggle'),
            document.getElementById('navToggle'),
            document.getElementById('searchInput'),
            document.getElementById('main-content')
          ].find(canRestoreModalFocus);
        }
        if (canRestoreModalFocus(next) && typeof next.focus === 'function') {
          next.focus({ preventScroll: true });
        }
      });
    }

    function reconcileModalFocus() {
      const overlays = [...document.querySelectorAll('.modal-overlay')];
      const shown = overlays.filter(overlay => overlay.classList.contains('show'));
      const shownSet = new Set(shown);
      const previous = modalFocusStack.slice();
      const closing = previous.filter(entry => !shownSet.has(entry.overlay));
      const newlyOpened = [];

      shown.forEach(overlay => {
        if (modalFocusStack.some(entry => entry.overlay === overlay)) return;
        let opener = document.activeElement;
        const closingOwner = closing.find(entry => opener && entry.overlay.contains(opener));
        if (closingOwner) opener = closingOwner.opener;
        if (!opener || opener === document.body || opener === document.documentElement) opener = modalLastExternalFocus;
        opener = normalizeModalOpener(opener);
        const entry = { overlay, opener };
        modalFocusStack.push(entry);
        newlyOpened.push(entry);
      });
      const kept = modalFocusStack.filter(entry => shownSet.has(entry.overlay));
      modalFocusStack.splice(0, modalFocusStack.length, ...kept);

      const top = modalFocusStack[modalFocusStack.length - 1] || null;
      if (top) {
        setModalBackgroundInert(true);
        modalFocusStack.forEach((entry, index) => {
          const isTop = entry === top;
          entry.overlay.inert = !isTop;
          entry.overlay.setAttribute('aria-hidden', isTop ? 'false' : 'true');
          entry.overlay.style.zIndex = String(100 + index);
        });
        closing.forEach(entry => {
          entry.overlay.inert = false;
          entry.overlay.setAttribute('aria-hidden', 'true');
          entry.overlay.style.removeProperty('z-index');
        });
        overlays.forEach(overlay => {
          if (!shownSet.has(overlay)) overlay.setAttribute('aria-hidden', 'true');
        });
        const closingTop = closing[closing.length - 1];
        const preferred = closingTop?.opener && top.overlay.contains(closingTop.opener) ? closingTop.opener : null;
        const active = document.activeElement;
        if (newlyOpened.includes(top) || !active || !top.overlay.contains(active) || preferred) focusTopModal(top, preferred);
      } else {
        overlays.forEach(overlay => {
          overlay.inert = false;
          overlay.setAttribute('aria-hidden', 'true');
          overlay.style.removeProperty('z-index');
        });
        setModalBackgroundInert(false);
        const closingTop = closing[closing.length - 1];
        if (closingTop) restoreModalFocus(closingTop.opener);
      }
      updateMobileDockState();
    }

    function initModalFocusManager() {
      if (modalFocusObserver) return;
      document.querySelectorAll('.modal-overlay').forEach(overlay => overlay.setAttribute('aria-hidden', overlay.classList.contains('show') ? 'false' : 'true'));
      document.addEventListener('focusin', event => {
        if (!event.target.closest?.('.modal-overlay.show')) modalLastExternalFocus = event.target;
        updateMobileDockState();
      }, true);
      document.getElementById('searchInput')?.addEventListener('blur', () => window.requestAnimationFrame(updateMobileDockState));
      modalFocusObserver = new MutationObserver(records => {
        if (records.some(record => record.target.matches?.('.modal-overlay'))) reconcileModalFocus();
      });
      const root = document.getElementById('appShell') || document.body;
      modalFocusObserver.observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
      reconcileModalFocus();
    }

    document.addEventListener('keydown', event => {
      const top = modalFocusStack[modalFocusStack.length - 1];
      if (!top) return;
      if (event.key === 'Escape' && top.overlay.dataset.escapeDisabled !== 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        top.overlay.click();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = modalFocusableElements(top.overlay);
      event.stopImmediatePropagation();
      if (!focusable.length) {
        event.preventDefault();
        focusTopModal(top);
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!top.overlay.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }, true);

    initModalFocusManager();

    // Workspace theme (persisted).
    const LEGACY_THEME_CLASSES = Array.from(document.documentElement.classList)
      .filter(name => name === 'dark' || name.startsWith('theme-'));
    function updateAppThemeColor() {
      window.requestAnimationFrame(() => {
        const themeMeta = document.querySelector('meta[name="theme-color"]');
        const surface = isMobileNav() ? document.querySelector('#appShell header') : document.getElementById('libraryDrawer');
        if (!themeMeta || !surface) return;
        const color = window.getComputedStyle(surface).backgroundColor;
        if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') themeMeta.content = color;
      });
    }
    function setTheme() {
      const name = 'orange';
      const html = document.documentElement;
      html.classList.remove(...LEGACY_THEME_CLASSES);
      html.classList.add('theme-orange');
      updateAppThemeColor();
      html.style.colorScheme = 'light';
      try { localStorage.setItem('savemeTheme', name); } catch (e) {}
    }
    function currentTheme() { return 'orange'; }
    (function restoreTheme() {
      setTheme();
    })();

    // Header overflow (kebab) menu — All Settings / Theme Switcher.
    function toggleHeaderMenu(event) {
      if (event) event.stopPropagation();
      const dd = document.getElementById('headerMenuDropdown');
      const btn = document.getElementById('btnMenu');
      if (!dd) return;
      const mobileSort = document.getElementById('mobileSortSelect');
      if (mobileSort) mobileSort.value = currentSort;
      const open = dd.classList.toggle('show');
      if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function closeHeaderMenu() {
      const dd = document.getElementById('headerMenuDropdown');
      const btn = document.getElementById('btnMenu');
      if (dd) dd.classList.remove('show');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('headerMenu');
      if (menu && !menu.contains(e.target)) closeHeaderMenu();
      const sm = document.getElementById('sortMenu');
      if (sm && !sm.contains(e.target)) closeSortMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeHeaderMenu(); closeSortMenu(); } });

    // Sort menu (icon-only trigger + checkmarked options).
    function markActiveSort() {
      document.querySelectorAll('#sortMenuDropdown .hmenu-item').forEach(el => {
        const on = el.dataset.sort === currentSort;
        el.classList.toggle('on', on);
        const chk = el.querySelector('.sort-check');
        if (chk) chk.textContent = on ? '✓' : '';
      });
      const mobileSort = document.getElementById('mobileSortSelect');
      if (mobileSort) mobileSort.value = currentSort;
    }
    function toggleSortMenu(event) {
      if (event) event.stopPropagation();
      const dd = document.getElementById('sortMenuDropdown');
      const btn = document.getElementById('btnSort');
      if (!dd) return;
      markActiveSort();
      const open = dd.classList.toggle('show');
      if (btn) { btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.classList.toggle('active', open); }
    }
    function closeSortMenu() {
      const dd = document.getElementById('sortMenuDropdown');
      const btn = document.getElementById('btnSort');
      if (dd) dd.classList.remove('show');
      if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.classList.remove('active'); }
    }
    function pickSort(value) {
      setSort(value);
      markActiveSort();
      closeSortMenu();
      closeHeaderMenu();
    }

    // Accordion: collapse/expand a sidebar section (favourites / projects / tags).
    function toggleSection(key) {
      const sec = document.querySelector(`.nav-section.acc[data-acc="${key}"]`);
      if (!sec) return;
      const collapsed = sec.classList.toggle('collapsed');
      const header = sec.querySelector(':scope > .acc-header');
      if (header) header.setAttribute('aria-expanded', String(!collapsed));
      try {
        const raw = JSON.parse(localStorage.getItem('savemeSectionsCollapsed') || '[]');
        const set = new Set(Array.isArray(raw) ? raw : []);
        if (collapsed) set.add(key); else set.delete(key);
        localStorage.setItem('savemeSectionsCollapsed', JSON.stringify([...set]));
      } catch (e) {}
    }
    (function restoreSections() {
      try {
        const raw = JSON.parse(localStorage.getItem('savemeSectionsCollapsed') || '[]');
        (Array.isArray(raw) ? raw : []).forEach(key => {
          const sec = document.querySelector(`.nav-section.acc[data-acc="${key}"]`);
          if (sec) {
            sec.classList.add('collapsed');
            const header = sec.querySelector(':scope > .acc-header');
            if (header) header.setAttribute('aria-expanded', 'false');
          }
        });
      } catch (e) {}
    })();
    (function restoreSidebar() {
      try {
        if (localStorage.getItem('savemeSidebarCollapsed') === '1' && !isMobileNav()) {
          document.body.classList.add('sidebar-collapsed');
        }
        const w = parseInt(localStorage.getItem('savemeSidebarWidth'), 10);
        if (w && w >= 220 && w <= 520) document.documentElement.style.setProperty('--sidebar-w', w + 'px');
      } catch (e) {}
    })();

    // Drag-to-resize the sidebar (persisted).
    (function initSidebarResize() {
      const handle = document.getElementById('sidebarResize');
      if (!handle) return;
      const MIN = 220, MAX = 520;
      let startX = 0, startW = 0, dragging = false;
      const onMove = (e) => {
        if (!dragging) return;
        let w = startW + (e.clientX - startX);
        w = Math.max(MIN, Math.min(MAX, w));
        document.documentElement.style.setProperty('--sidebar-w', w + 'px');
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('sidebar-resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        const cur = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim();
        try { localStorage.setItem('savemeSidebarWidth', parseInt(cur, 10)); } catch (e) {}
      };
      handle.addEventListener('mousedown', (e) => {
        if (document.body.classList.contains('sidebar-collapsed')) return;
        dragging = true;
        startX = e.clientX;
        startW = document.querySelector('aside').getBoundingClientRect().width;
        document.body.classList.add('sidebar-resizing');
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        e.preventDefault();
      });
    })();

    // Infer an auto-project name for a link when the user isn't inside a project.
    // Prefer the link's strongest topic tag; fall back to a prettified domain.
    function inferProjectName(autoTags, domain) {
      const tag = (autoTags || []).find(t => t && t.toLowerCase() !== 'web');
      if (tag) return titleCase(tag);
      const host = String(domain || '').replace(/^www\./, '');
      const label = host.split('.')[0] || host;
      return titleCase(label) || 'General';
    }

    // Tag frequency profile for the links already in a project (its "theme").
    function projectTagProfile(name) {
      const prof = {};
      for (const it of items) {
        if (it.project !== name || it.archived) continue;
        for (const t of (it.autoTags || [])) prof[t] = (prof[t] || 0) + 1;
      }
      return prof;
    }

    // Smart folder assignment — files a new link where a human would:
    //   1) into a folder that already holds links from the same domain,
    //   2) else the folder whose links share the most tags with this one,
    //   3) else a fresh topical folder named after the strongest tag.
    function chooseProject(meta, domain) {
      const tags = (meta.autoTags || []).map(t => t.toLowerCase()).filter(t => t !== 'web');

      // 1) Same-domain sibling — strongest real-world grouping signal.
      const byDomain = {};
      for (const it of items) {
        if (it.archived) continue;
        if (it.domain === domain) byDomain[it.project] = (byDomain[it.project] || 0) + 1;
      }
      const domHit = Object.keys(byDomain).sort((a, b) => byDomain[b] - byDomain[a])[0];
      if (domHit) return domHit;

      // 2) Topical match — folder whose existing links overlap this link's tags.
      if (tags.length) {
        let best = null, bestScore = 0;
        for (const p of customProjects) {
          const prof = projectTagProfile(p);
          const total = Object.values(prof).reduce((a, b) => a + b, 0);
          if (total < 2) continue;                 // ignore brand-new / tiny folders
          let overlap = 0;
          for (const t in prof) if (tags.includes(t.toLowerCase())) overlap += prof[t];
          const score = overlap / total;
          if (score > bestScore) { bestScore = score; best = p; }
        }
        if (best && bestScore >= 0.34) return best; // needs a meaningful shared theme
      }

      // 3) Otherwise start a fresh topical folder.
      return inferProjectName(meta.autoTags, domain);
    }

    // Import uses a deliberately small taxonomy. A weak classifier signal must
    // never create a brand-new folder or scatter one browser import into dozens
    // of almost-identical categories.
    const SMART_IMPORT_FOLDERS = [
      ['AI', ['ai', 'ml']],
      ['Development', ['dev', 'code', 'css', 'web', 'database', 'devops', 'security']],
      ['Design', ['design', 'ui/ux', 'inspiration']],
      ['Learning', ['learning', 'course', 'guide', 'reference', 'docs', 'research']],
      ['Reading', ['article', 'blog', 'news', 'newsletter']],
      ['Media', ['video', 'audio', 'music', 'podcast', 'photography']],
      ['Work', ['productivity', 'pm', 'career', 'marketing', 'startups']],
      ['Finance', ['finance', 'payments', 'crypto']],
      ['Shopping', ['shopping', 'marketplace']],
      ['Travel', ['travel']],
      ['Social', ['social', 'community']]
    ];
    function smartImportProject(meta) {
      const tags = new Set((meta.autoTags || []).map(tag => String(tag).toLowerCase()));
      for (const [folder, signals] of SMART_IMPORT_FOLDERS) {
        if (signals.some(signal => tags.has(signal))) return folder;
      }
      return 'Inbox';
    }

    // Ensure a project exists in the registry; `priority` marks it manually-created.
    function ensureProject(nameOrId, priority, options = {}) {
      if (!nameOrId) return null;
      let folder = folders[nameOrId];
      if (!folder) folder = createFolderEntity(nameOrId, options);
      if (!folder) return null;
      if (!customProjects.includes(folder.id)) customProjects.push(folder.id);
      if (priority) priorityProjects.add(folder.id);
      dbSaveProjects();
      return folder.id;
    }

    async function addNewProject() {
      const name = await uiPrompt({ title: 'New folder', message: 'Give your folder a name.', okLabel: 'Create', icon: 'folderPlus' });
      if (name && name.trim()) {
        const cleanName = name.trim();
        if (!folderByName(cleanName, null)) {
          const folder = createFolderEntity(cleanName, { kind: 'manual', parentId: null });
          priorityProjects.add(folder.id);
          dbSaveProjects();
          refresh();
        } else showToast(`Folder “${cleanName}” already exists`);
      }
    }

    // Create a sub-folder (nested project) under an existing project.
    async function addSubfolder(e, parent) {
      e.stopPropagation();
      const parentLabel = folderName(parent);
      const name = await uiPrompt({ title: 'New subfolder', message: `Create a folder inside "${parentLabel}".`, okLabel: 'Create', icon: 'folderPlus' });
      if (!name || !name.trim()) return;
      const clean = name.trim();
      if (clean.toLocaleLowerCase() === folderName(parent).toLocaleLowerCase()) return;
      if (folderByName(clean, parent)) { showToast(`Folder “${clean}” already exists here`); return; }
      const folder = createFolderEntity(clean, { kind: 'manual', parentId: parent, reuseSibling: false });
      dbSaveProjects();
      projectCollapsed.delete(parent);
      finderExpanded.add(parent);
      refresh();
    }

    async function renameProject(e, name) {
      e.stopPropagation();
      const nn = await uiPrompt({ title: 'Rename folder', value: name, okLabel: 'Rename', icon: 'edit' });
      if (!nn || !nn.trim()) return;
      const clean = cleanFolderName(nn);
      if (clean === folderName(name)) return;
      const folder = folders[name];
      if (!folder) return;
      if (folderByName(clean, folder.parentId)?.id !== name && folderByName(clean, folder.parentId)) {
        showToast(`Folder “${clean}” already exists here`); return;
      }
      folder.name = clean; folder.updatedAt = Date.now();
      const moved = items.filter(item => item.folderId === name || item.project === name);
      moved.forEach(item => { item.projectName = clean; });
      if (moved.length) dbPutMany(moved);
      dbSaveProjects();
      refresh();
    }

    async function deleteProject(e, name) {
      e.stopPropagation();
      const deletedName = folderName(name);
      const count = items.filter(i => i.project === name || i.folderId === name).length;
      const ok = await uiConfirm({
        title: `Delete "${folderName(name)}"?`,
        message: count ? `Its ${count} link${count > 1 ? 's' : ''} will move to General. Any sub-folders move up a level.` : 'Any sub-folders move up a level.',
        okLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      customProjects = customProjects.filter(p => p !== name);
      priorityProjects.delete(name);
      // Re-home children to this project's parent (or root), then drop it.
      const grand = projectParent[name] || null;
      for (const k in projectParent) { if (projectParent[k] === name) { if (grand) projectParent[k] = grand; else delete projectParent[k]; if (folders[k]) { folders[k].parentId = grand; folders[k].updatedAt = Date.now(); } } }
      delete projectParent[name];
      projectCollapsed.delete(name);
      finderExpanded.delete(name);
      const moved = items.filter(i => i.project === name || i.folderId === name);
      // Drop the source before resolving General. Otherwise deleting a folder
      // named General resolves the fallback back to the folder being deleted
      // and leaves its links pointing at an orphaned id.
      delete folders[name];
      delete projectMeta[name];
      if (moved.length) {
        const generalId = ensureProject('General', false, { kind: 'system' });
        moved.forEach(i => {
          i.project = generalId; i.folderId = generalId; i.projectName = folderName(generalId);
        });
      }
      if (activeFilter === name) activeFilter = null;
      dbPutMany(moved);
      dbSaveProjects();
      refresh();
      showToast(`Deleted folder "${deletedName}"`);
    }

    // Star = "my project" (manually mine); unstarred = auto-generated. User-controlled.
    function togglePriority(e, name) {
      e.stopPropagation();
      if (priorityProjects.has(name)) priorityProjects.delete(name);
      else priorityProjects.add(name);
      if (!customProjects.includes(name)) customProjects.push(name);
      dbSaveProjects();
      renderProjectsUI();
    }

    /* ---- Per-folder icon + color accent ------------------------------------ */
    // A palette of feather-style line icons (no emoji) to brand a folder.
    const ICON_LIB = {
      folder:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      star:     '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
      heart:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      flame:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
      code:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
      palette:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
      rocket:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
      book:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      music:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
      video:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
      image:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
      cart:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
      briefcase:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
      globe:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
      chart:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      cloud:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
      lock:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
      target:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      zap:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      beaker:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2h6M10 2v6.5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9.5V2"/><line x1="7" y1="14" x2="17" y2="14"/></svg>',
      tag:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
    };
    const FOLDER_ICON_KEYS = Object.keys(ICON_LIB);
    // Folder colour is part of the application chrome, not user content. Keep
    // the single production accent here; legacy synced values remain stored so
    // older backups still round-trip, but projectColor() renders them as orange.
    const FOLDER_COLORS = ['#F4511E'];
    function projectIconHtml(name) {
      const m = projectMeta[name];
      // Finder-style tree: every nested item is visibly a folder. This keeps
      // hierarchy readable and prevents guessed content icons from becoming
      // misleading. Custom icons remain available for top-level collections.
      if (projectParent[name]) return ICONS.folder;
      if (m && m.icon && ICON_LIB[m.icon]) return ICON_LIB[m.icon];
      if (m && m.emoji) return `<span class="proj-emoji">${esc(m.emoji)}</span>`;   // legacy data
      if (priorityProjects.has(name)) return ICONS.star;
      return ICONS.folder;
    }
    function projectColor(name) {
      const m = projectMeta[name];
      if (!m || !m.color || !safeColor(m.color)) return null;
      return FOLDER_COLORS[0];
    }

    let _fcName = null;
    function openFolderCustomize(e, name) {
      if (e) e.stopPropagation();
      _fcName = name;
      document.getElementById('fcName').innerHTML = `Personalize <b>${htmlAttr(folderName(name))}</b> with an icon and color.`;
      const meta = projectMeta[name] || {};
      const eWrap = document.getElementById('fcEmoji');
      const previewColor = projectColor(name) || 'var(--brand-primary)';
      eWrap.style.setProperty('--folder-preview', previewColor || 'var(--brand-primary)');
      eWrap.innerHTML = FOLDER_ICON_KEYS.map(key =>
        `<button type="button" class="fc-icon${meta.icon === key ? ' on' : ''}" title="${key}" aria-label="Use ${key} folder icon" aria-pressed="${meta.icon === key ? 'true' : 'false'}" onclick="setFolderIcon('${key}')">${ICON_LIB[key]}</button>`
      ).join('');
      const cWrap = document.getElementById('fcColor');
      cWrap.innerHTML = FOLDER_COLORS.map(col =>
        `<button type="button" class="fc-color${projectColor(name) === col ? ' on' : ''}" aria-label="Use folder accent ${col}" aria-pressed="${projectColor(name) === col ? 'true' : 'false'}" title="${col}" onclick="setFolderColor('${col}')" style="--folder-choice:${col}"></button>`
      ).join('');
      document.getElementById('folderCustomOverlay').classList.add('show');
    }
    function closeFolderCustomize() { document.getElementById('folderCustomOverlay').classList.remove('show'); _fcName = null; }
    function setFolderIcon(key) {
      if (!_fcName) return;
      const m = projectMeta[_fcName] || (projectMeta[_fcName] = {});
      m.icon = (m.icon === key) ? null : key;
      delete m.emoji;   // migrate off any legacy emoji
      persistFolderMeta(_fcName);
    }
    function setFolderColor(col) {
      if (!_fcName) return;
      const m = projectMeta[_fcName] || (projectMeta[_fcName] = {});
      m.color = (projectColor(_fcName) === col) ? null : col;
      persistFolderMeta(_fcName);
    }
    function clearFolderCustomize() {
      if (_fcName) { delete projectMeta[_fcName]; persistFolderMeta(_fcName); }
    }
    function persistFolderMeta(name) {
      const m = projectMeta[name];
      if (m && !m.icon && !m.emoji && !m.color) delete projectMeta[name];
      dbSaveProjects();
      renderSidebar();
      renderSubfolderBar();
      renderItems(getVisibleItems());
      if (document.getElementById('folderCustomOverlay').classList.contains('show') && _fcName) openFolderCustomize(null, _fcName);
    }
    // Line icons (feather-style) used across the sidebar
    const ICONS = {
      folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
      subfolder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V6a2 2 0 0 1 2-2h3.5l2 3H18a2 2 0 0 1 2 2v1"/><path d="M4 20h13.6a2 2 0 0 0 1.9-1.4L22 11H8.4a2 2 0 0 0-1.9 1.4L4 20z"/></svg>',
      folderPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
      hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
      edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
      trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.34-2.68a2 2 0 0 1-.21-.9V6a2 2 0 0 0-2-2H8.55a2 2 0 0 0-2 2v7.42a2 2 0 0 1-.21.9L5 17z"/></svg>',
      eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    };

    /* ---- Sub-folders (project hierarchy) ------------------------------------ */
    // Re-render both the Favourites list and the Projects tree together, so a
    // star/nest/collapse change is reflected in both at once.
    function renderProjectsUI() {
      renderSidebarFavourites();
      renderSidebarProjects();
      renderSubfolderBar();
    }
    function allKnownProjects() {
      return [...new Set([...customProjects, ...Object.keys(folders), ...items.map(i => i.folderId || i.project)])].filter(id => id && folders[id]);
    }
    function itemFolderId(item) {
      return item?.folderId || item?.project || null;
    }
    function liveLibraryItems() {
      return items.filter(item => !item.archived);
    }
    function folderDirectCounts() {
      const counts = new Map();
      for (const item of liveLibraryItems()) {
        const folderId = itemFolderId(item);
        if (folderId) counts.set(folderId, (counts.get(folderId) || 0) + 1);
      }
      return counts;
    }
    function repairFolderAssignments() {
      const changed = [];
      const obsoleteImportedFolders = new Set();
      let hierarchyChanged = false;
      // Recover imports created before browser root metadata existed. These
      // browser-native toolbar names identify the export without touching
      // ordinary user-created folders.
      const knownFolders = new Set([...customProjects, ...items.map(item => item.project)].filter(Boolean));
      let recoveredBrowserRoot = null;
      if (knownFolders.has('Favorites Bar')) recoveredBrowserRoot = 'Edge Browser';
      else if (knownFolders.has('Bookmarks Bar') || knownFolders.has('Bookmarks bar')) recoveredBrowserRoot = 'Chrome Browser';
      else if (knownFolders.has('Bookmarks Menu') || knownFolders.has('Other Bookmarks')) recoveredBrowserRoot = 'Firefox Browser';
      if (recoveredBrowserRoot) {
        const nativeRoots = recoveredBrowserRoot === 'Edge Browser' ? ['Favorites Bar']
          : recoveredBrowserRoot === 'Chrome Browser' ? ['Bookmarks Bar', 'Bookmarks bar']
            : ['Bookmarks Menu', 'Other Bookmarks'];
        nativeRoots.filter(name => knownFolders.has(name)).forEach(name => {
          if (projectParent[name] !== recoveredBrowserRoot) { projectParent[name] = recoveredBrowserRoot; hierarchyChanged = true; }
        });
        if (!customProjects.includes(recoveredBrowserRoot)) customProjects.push(recoveredBrowserRoot);

        // Confirmed folders from this user's legacy Edge export predate the
        // imported/folderSource flags, so metadata-only detection cannot see
        // them. Keep their names but attach them to the recovered Edge root.
        if (recoveredBrowserRoot === 'Edge Browser') {
          for (const folder of ['travelink.me', 'APPLE TV']) {
            if (!knownFolders.has(folder)) continue;
            if (projectParent[folder] !== recoveredBrowserRoot) {
              projectParent[folder] = recoveredBrowserRoot;
              hierarchyChanged = true;
            }
            for (const item of items) {
              if (item.project !== folder) continue;
              if (item.importRoot !== recoveredBrowserRoot || item.folderSource !== 'browser-import') {
                item.importRoot = recoveredBrowserRoot;
                item.folderSource = 'browser-import';
                if (!changed.includes(item)) changed.push(item);
              }
            }
          }
        }

        // Older exports also placed every original browser folder at the app
        // root. Put folders such as travelink.me and APPLE TV under the detected
        // browser root when all of their links are import records. A folder with
        // any manually saved link is intentionally left untouched.
        for (const folder of knownFolders) {
          if (folder === recoveredBrowserRoot || folder === 'Imported' || nativeRoots.includes(folder) || projectParent[folder]) continue;
          const folderItems = items.filter(item => item.project === folder);
          if (folderItems.length && folderItems.every(item => item.imported === true)) {
            projectParent[folder] = recoveredBrowserRoot;
            hierarchyChanged = true;
          }
        }

        // "Imported" was an old technical bucket. Remove it only when every
        // contained link is explicitly marked as imported.
        const legacyImportedItems = items.filter(item => item.project === 'Imported');
        if (legacyImportedItems.length && legacyImportedItems.every(item => item.imported === true)) {
          for (const item of legacyImportedItems) {
            item.project = recoveredBrowserRoot;
            item.importRoot = recoveredBrowserRoot;
            item.folderSource = 'browser-import';
            changed.push(item);
          }
          Object.keys(projectParent).forEach(child => {
            if (projectParent[child] === 'Imported') { projectParent[child] = recoveredBrowserRoot; hierarchyChanged = true; }
          });
          obsoleteImportedFolders.add('Imported');
        }
      }
      for (const item of items) {
        let clean = typeof item.project === 'string' ? item.project.trim() : '';
        // Older smart imports displayed redundant names such as
        // "Edge Favorites Development". Keep the browser root as the parent,
        // but show the child with its clean human name: "Development".
        const importRoot = typeof item.importRoot === 'string' ? item.importRoot.trim() : '';
        if (item.folderSource === 'browser-import' && importRoot && clean.startsWith(importRoot + ' ')) {
          const childName = clean.slice(importRoot.length + 1).trim();
          const validSmartName = childName === 'Inbox' || SMART_IMPORT_FOLDERS.some(([name]) => name === childName);
          if (validSmartName) {
            obsoleteImportedFolders.add(clean);
            clean = childName;
            if (projectParent[childName] !== importRoot) { projectParent[childName] = importRoot; hierarchyChanged = true; }
          }
        }
        if (!clean) {
          item.project = 'Inbox';
          changed.push(item);
        } else if (clean !== item.project) {
          item.project = clean;
          changed.push(item);
        }
      }
      const itemFolders = items.map(item => item.project).filter(Boolean);
      obsoleteImportedFolders.forEach(name => {
        delete projectParent[name];
        priorityProjects.delete(name);
        delete projectMeta[name];
      });
      const nextProjects = [...new Set([...customProjects.filter(name => name && !obsoleteImportedFolders.has(name)), ...itemFolders])];
      const registryChanged = nextProjects.length !== customProjects.length || nextProjects.some((name, index) => name !== customProjects[index]);
      customProjects = nextProjects;
      if (activeFilter && !customProjects.includes(activeFilter)) activeFilter = null;
      if (changed.length) dbPutMany(changed);
      if (changed.length || registryChanged || hierarchyChanged) dbSaveProjects();
      return changed.length;
    }
    function childrenOf(name, all) {
      return all.filter(p => projectParent[p] === name);
    }
    function isDescendant(name, maybeAncestor) {
      let p = projectParent[name];
      const seen = new Set();
      while (p && !seen.has(p)) { if (p === maybeAncestor) return true; seen.add(p); p = projectParent[p]; }
      return false;
    }
    // Rollup: own links + all descendants' links (matches filterProject behavior).
    function rollupCount(name, counts, all) {
      let n = counts.get(name) || 0;
      for (const c of childrenOf(name, all)) n += rollupCount(c, counts, all);
      return n;
    }
    function nestProject(child, parent) {
      if (!child || child === parent) return;
      if (isDescendant(parent, child)) return;   // no cycles
      projectParent[child] = parent;
      if (folders[child]) { folders[child].parentId = parent; folders[child].updatedAt = Date.now(); }
      projectCollapsed.delete(parent);           // reveal the new child
      if (!customProjects.includes(child)) customProjects.push(child);
      dbSaveProjects();
      refresh();
    }
    function unnestProject(child) {
      if (projectParent[child]) { delete projectParent[child]; if (folders[child]) { folders[child].parentId = null; folders[child].updatedAt = Date.now(); } dbSaveProjects(); refresh(); }
    }
    function toggleCollapse(e, name) {
      e.stopPropagation();
      if (projectCollapsed.has(name)) projectCollapsed.delete(name); else projectCollapsed.add(name);
      dbSaveProjects();
      renderProjectsUI();
    }

    function makeProjectRow(projectName, depth, counts, all) {
      const projectCount = rollupCount(projectName, counts, all);
      const isPriority = priorityProjects.has(projectName);
      const div = document.createElement('div');
      const branchActive = activeFilter === projectName || (activeFilter && isDescendant(activeFilter, projectName));
      div.className = `nav-item ${branchActive ? 'active' : ''}${isPriority ? ' priority' : ''}`;
      // Keep deep imported bookmark trees readable without letting indentation
      // consume most of the compact sidebar.
      div.style.paddingLeft = (7 + depth * 14) + 'px';
      div.draggable = true;

      div.ondragstart = (e) => { dragKind = 'project'; draggedName = projectName; e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; };
      div.ondragend = () => { dragKind = null; draggedName = null; div.classList.remove('drag-over'); };
      div.ondragover = (e) => {
        if (dragKind === 'card') { e.preventDefault(); div.classList.add('drag-over'); }
        else if (dragKind === 'project' && draggedName !== projectName && !isDescendant(projectName, draggedName)) { e.preventDefault(); div.classList.add('drag-over'); }
      };
      div.ondragleave = () => div.classList.remove('drag-over');
      div.ondrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        div.classList.remove('drag-over');
        if (dragKind === 'card' && draggedItemId) {
          const item = items.find(i => sameId(i.id, draggedItemId));
          if (item) { item.project = projectName; item.folderId = projectName; item.projectName = folderName(projectName); dbPut(item); refresh(); }
        } else if (dragKind === 'project' && draggedName) {
          nestProject(draggedName, projectName);
        }
      };

      const folderAccent = projectColor(projectName);
      if (folderAccent) {
        div.classList.add('has-folder-accent');
        div.style.setProperty('--folder-accent', folderAccent);
      }
      div.innerHTML = `
        <button type="button" class="project-open" draggable="true" title="${htmlAttr(folderName(projectName))}" onclick="filterProject('${jsAttr(projectName)}')"${branchActive ? ' aria-current="page"' : ''}>
          <span class="nav-icon" aria-hidden="true">${projectIconHtml(projectName)}</span>
          <span class="nav-label">${esc(folderName(projectName))}</span>
          <span class="badge">${projectCount}</span>
        </button>
        <span class="nav-right">
          <button type="button" class="proj-act" title="Customize" aria-label="Customize ${htmlAttr(folderName(projectName))}" onclick="openFolderCustomize(event, '${jsAttr(projectName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="16" cy="15" r="2.5"/><circle cx="8" cy="19" r="2"/></svg></button>
          <button type="button" class="proj-act${isPriority ? ' on' : ''}" title="${isPriority ? 'Remove favorite' : 'Mark as favorite'}" aria-label="${isPriority ? 'Remove' : 'Mark'} ${htmlAttr(folderName(projectName))} ${isPriority ? 'from favorites' : 'as favorite'}" aria-pressed="${isPriority ? 'true' : 'false'}" onclick="togglePriority(event, '${jsAttr(projectName)}')">${ICONS.star}</button>
        </span>
      `;
      return div;
    }

    function renderSidebarProjects() {
      const projectContainer = document.getElementById('project-list');
      projectContainer.innerHTML = '';

      // One O(N) pass for all counts — never O(projects × links).
      const counts = folderDirectCounts();

      const all = allKnownProjects();

      // The sidebar is a source list, not a tree: it always exposes root folders
      // only. Subfolders remain available in the compact navigator in main.
      const roots = all.filter(p => !projectParent[p] || !all.includes(projectParent[p]));

      // Search narrows the root locations only; it must never leak nested folders
      // back into the sidebar.
      if (projectQuery) {
        const matches = roots.filter(p => folderName(p).toLowerCase().includes(projectQuery))
          .sort((a, b) => (priorityProjects.has(b) - priorityProjects.has(a)) ||
            (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || folderName(a).localeCompare(folderName(b)));
        if (!matches.length) { projectContainer.innerHTML = '<div class="tag-empty">No folders match</div>'; return; }
        matches.forEach(p => projectContainer.appendChild(makeProjectRow(p, 0, counts, all)));
        return;
      }

      // Finder source-list methodology: the sidebar contains locations only.
      // Children are rendered in the main content pane after a location is
      // selected, instead of expanding an arbitrarily deep sidebar tree.
      roots.sort((a, b) => (priorityProjects.has(b) - priorityProjects.has(a)) ||
        (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || folderName(a).localeCompare(folderName(b)));

      if (!roots.length) { projectContainer.innerHTML = '<div class="tag-empty">No folders yet</div>'; return; }

      const shownRoots = showAllProjects ? roots : roots.slice(0, PROJECT_LIMIT);
      shownRoots.forEach(r => projectContainer.appendChild(makeProjectRow(r, 0, counts, all)));

      if (roots.length > PROJECT_LIMIT) {
        const more = document.createElement('button');
        more.className = 'tag-more';
        more.textContent = showAllProjects ? 'Show less' : `Show all ${roots.length} folders`;
        more.onclick = () => { showAllProjects = !showAllProjects; renderSidebarProjects(); };
        projectContainer.appendChild(more);
      }
    }

    /* Sidebar tag filter (#10) — supports manual drag-reorder */
    function currentOrderedTags() {
      const counts = {};
      items.forEach(i => (i.autoTags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
      let tags = Object.keys(counts);
      if (tagOrder.length) {
        const idx = new Map(tagOrder.map((t, i) => [t, i]));
        tags.sort((a, b) => {
          const ia = idx.has(a) ? idx.get(a) : Infinity, ib = idx.has(b) ? idx.get(b) : Infinity;
          return ia - ib || counts[b] - counts[a] || a.localeCompare(b);
        });
      } else {
        tags.sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
      }
      return { tags, counts };
    }

    function reorderTag(dragged, target, placeAfter) {
      if (dragged === target) return;
      const { tags } = currentOrderedTags();
      const from = tags.indexOf(dragged); if (from < 0) return;
      tags.splice(from, 1);
      let to = tags.indexOf(target);
      if (to < 0) { tags.push(dragged); } else { if (placeAfter) to += 1; tags.splice(to, 0, dragged); }
      tagOrder = tags;
      dbSaveProjects();
      renderSidebarTags();
    }

    function renderSidebarTags() {
      const c = document.getElementById('tag-list');
      if (!c) return;
      const { tags, counts } = currentOrderedTags();
      c.innerHTML = '';
      // Active multi-tag filter bar: chips for each selected tag + AND/OR toggle.
      if (activeTags.length) {
        const bar = document.createElement('div');
        bar.className = 'tag-active-bar';
        activeTags.forEach(t => {
          const chip = document.createElement('button');
          chip.className = `tag-chip-active ${getTagColorClass(t)}`;
          chip.title = 'Remove from filter';
          chip.innerHTML = `#${esc(t)}<span class="chip-x">×</span>`;
          chip.onclick = () => filterTag(t);
          bar.appendChild(chip);
        });
        if (activeTags.length >= 2) {
          const tog = document.createElement('div');
          tog.className = 'tag-mode-toggle';
          tog.innerHTML =
            `<button class="${tagMode === 'or' ? 'on' : ''}" onclick="setTagMode('or')" title="Match ANY selected tag">Any</button>` +
            `<button class="${tagMode === 'and' ? 'on' : ''}" onclick="setTagMode('and')" title="Match ALL selected tags">All</button>`;
          bar.appendChild(tog);
        }
        const clr = document.createElement('button');
        clr.className = 'tag-chip-clear';
        clr.textContent = 'Clear';
        clr.onclick = () => clearTags();
        bar.appendChild(clr);
        c.appendChild(bar);
      }
      if (!tags.length) { if (!activeTags.length) c.innerHTML = '<div class="tag-empty">No tags yet</div>'; return; }
      // Keep the sidebar bounded — show only the top-N tags (in manual/count order).
      const shown = tags.slice(0, TAG_LIMIT);
      shown.forEach(t => {
        const active = tagActive(t);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `tag-nav ${getTagColorClass(t)}${active ? ' active' : ''}`;
        el.draggable = true;
        el.setAttribute('aria-pressed', String(active));
        el.setAttribute('aria-label', `${active ? 'Remove' : 'Filter by'} tag ${t}, ${counts[t]} link${counts[t] === 1 ? '' : 's'}`);
        el.onclick = () => filterTag(t);
        el.ondragstart = (e) => { dragKind = 'tag'; draggedName = t; e.dataTransfer.effectAllowed = 'move'; };
        el.ondragend = () => { dragKind = null; draggedName = null; el.classList.remove('drop-before', 'drop-after'); };
        el.ondragover = (e) => {
          if (dragKind !== 'tag' || draggedName === t) return;
          e.preventDefault();
          const r = el.getBoundingClientRect();
          const after = (e.clientX - r.left) > r.width / 2;
          el.classList.toggle('drop-after', after);
          el.classList.toggle('drop-before', !after);
        };
        el.ondragleave = () => el.classList.remove('drop-before', 'drop-after');
        el.ondrop = (e) => {
          if (dragKind !== 'tag' || draggedName === t) return;
          e.preventDefault();
          const after = el.classList.contains('drop-after');
          el.classList.remove('drop-before', 'drop-after');
          reorderTag(draggedName, t, after);
        };
        el.innerHTML = `#${esc(t)} <span class="tag-nav-count">${counts[t]}</span>`;
        c.appendChild(el);
      });
      if (tags.length > TAG_LIMIT) {
        const more = document.createElement('button');
        more.className = 'tag-more';
        more.textContent = `Show all ${tags.length} tags`;
        more.onclick = () => openTagsModal();
        c.appendChild(more);
      }
    }

    /* ---- All-tags modal (searchable) ---------------------------------------- */
    function openTagsModal() {
      const overlay = document.getElementById('tagsOverlay');
      overlay.classList.add('show');
      const search = document.getElementById('tagsSearch');
      search.value = '';
      renderTagsModal('');
      search.focus();
    }
    function closeTagsModal() {
      document.getElementById('tagsOverlay').classList.remove('show');
    }
    function onTagsSearch(v) {
      renderTagsModal((v || '').trim().toLowerCase());
    }
    function renderTagsModal(query) {
      const grid = document.getElementById('tagsModalList');
      const counts = {};
      items.forEach(i => (i.autoTags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
      let tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
      if (query) tags = tags.filter(t => t.toLowerCase().includes(query));
      grid.innerHTML = '';
      if (!tags.length) { grid.innerHTML = '<div class="tag-empty">No tags match</div>'; return; }
      tags.forEach(t => {
        const active = tagActive(t);
        const wrap = document.createElement('span');
        wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px';
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `tag-nav ${getTagColorClass(t)}${active ? ' active' : ''}`;
        el.setAttribute('aria-pressed', String(active));
        el.setAttribute('aria-label', `${active ? 'Remove' : 'Filter by'} tag ${t}, ${counts[t]} link${counts[t] === 1 ? '' : 's'}`);
        el.onclick = () => { filterTag(t); closeTagsModal(); };
        el.innerHTML = `#${esc(t)} <span class="tag-nav-count">${counts[t]}</span>`;
        const ren = document.createElement('button');
        ren.className = 'tag-add';
        ren.title = 'Rename / merge tag';
        ren.style.cssText = 'padding:2px;color:var(--text-muted)';
        ren.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
        ren.onclick = (ev) => { ev.stopPropagation(); renameTagGlobal(t); };
        wrap.appendChild(el);
        wrap.appendChild(ren);
        grid.appendChild(wrap);
      });
    }

    // Rename a tag across every link. If the new name already exists on a link,
    // they merge (deduped). Also updates suggested tags, tag order, and active filter.
    async function renameTagGlobal(oldTag) {
      const nn = await uiPrompt({ title: 'Rename tag', message: `Rename #${oldTag} everywhere. If the new name already exists, the tags merge.`, value: oldTag, okLabel: 'Rename', icon: 'edit' });
      if (!nn || !nn.trim()) return;
      const nt = normalizeTag(nn.trim());
      if (!nt || nt === oldTag) return;
      const changed = [];
      const low = oldTag.toLowerCase();
      items.forEach(i => {
        let touched = false;
        if (i.autoTags && i.autoTags.some(t => t.toLowerCase() === low)) {
          const kept = i.autoTags.filter(t => t.toLowerCase() !== low);
          if (!kept.some(t => t.toLowerCase() === nt.toLowerCase())) kept.push(nt);
          i.autoTags = kept; touched = true;
        }
        if (i.suggestedTags && i.suggestedTags.some(t => t.toLowerCase() === low)) {
          i.suggestedTags = i.suggestedTags.filter(t => t.toLowerCase() !== low);
          touched = true;
        }
        if (touched) changed.push(i);
      });
      // Keep manual tag order coherent.
      if (tagOrder.length) {
        tagOrder = tagOrder.map(t => (t.toLowerCase() === low ? nt : t));
        tagOrder = [...new Set(tagOrder)];
      }
      activeTags = activeTags.map(t => (t.toLowerCase() === low ? nt : t));
      activeTags = activeTags.filter((t, i) => activeTags.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i);
      if (changed.length) dbPutMany(changed);
      dbSaveProjects();
      refresh();
      renderTagsModal((document.getElementById('tagsSearch').value || '').trim().toLowerCase());
      showToast(`Renamed #${oldTag} → #${nt} on ${changed.length} link${changed.length === 1 ? '' : 's'}`);
    }

    function renderSidebar() {
      renderSidebarFavourites();
      renderSidebarProjects();
      renderSidebarTags();
      const setCurrentSidebarView = (element, current) => {
        if (!element) return;
        element.classList.toggle('active', current);
        if (current) element.setAttribute('aria-current', 'page');
        else element.removeAttribute('aria-current');
      };
      const na = document.getElementById('nav-all');
      setCurrentSidebarView(na, !activeFilter && !activeTags.length && !pinnedView && !recentView);
      const np = document.getElementById('nav-pinned');
      setCurrentSidebarView(np, pinnedView);
      const pc = document.getElementById('count-pinned');
      if (pc) pc.innerText = items.filter(i => i.pinned && !i.archived).length;
      const nr = document.getElementById('nav-recent');
      setCurrentSidebarView(nr, recentView);
      const rc = document.getElementById('count-recent');
      if (rc) rc.innerText = items.filter(i => !i.archived).length;
    }

    // Favourites = starred (priority) projects, quick-access list.
    function renderSidebarFavourites() {
      const c = document.getElementById('favourite-list');
      if (!c) return;
      const counts = folderDirectCounts();
      const all = allKnownProjects();
      const favs = [...priorityProjects].filter(p => all.includes(p))
        .sort((a, b) => (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || folderName(a).localeCompare(folderName(b)));
      c.innerHTML = '';
      if (!favs.length) { c.innerHTML = '<div class="fav-empty">Star a folder to pin it here</div>'; return; }
      favs.filter(p => !projectParent[p] || !all.includes(projectParent[p]))
        .forEach(p => c.appendChild(makeProjectRow(p, 0, counts, all)));
    }

    // ---- Chunked rendering (virtual/windowed) ---------------------------------
    // At 100k links we never build 100k DOM nodes at once — that freezes the tab.
    // We render in batches of CHUNK and append the next batch when a sentinel near
    // the viewport bottom scrolls into view. Any filter/sort/search resets to batch 1,
    // so the working set stays tiny. This is masonry-safe (no height measurement).
    const CHUNK = 80;
    let _visible = [];      // full filtered+sorted list currently on screen
    let _rendered = 0;      // how many of _visible are in the DOM
    let _io = null;         // IntersectionObserver for the load-more sentinel
    let _finderRows = [];   // mixed folder/link rows for Finder list view
    let _finderRendered = 0;

    // Deterministic hue (0-359) from a string — local, no network.
    function domainHue(s) {
      const str = String(s || '');
      let h = 0;
      for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
      return h % 360;
    }
    // Favicon markup. Normally the Google favicon service; in Privacy mode a local
    // letter badge (colored by a hash of the domain) so no request is made.
    // opts: { cls (extra class), style (extra inline style, e.g. explicit size) }
    function faviconHtml(domain, opts = {}) {
      const d = String(domain || '');
      const cls = String(opts.cls || '');
      const style = String(opts.style || '');
      if (privacyMode) {
        const letter = esc((d.replace(/^www\./, '').charAt(0) || '?').toUpperCase());
        const cl = ('fav-mono' + (cls ? ' ' + cls : '')).trim();
        return `<span class="${htmlAttr(cl)}" style="${htmlAttr('background:hsl(' + domainHue(d) + ' 55% 45%);' + style)}">${letter}</span>`;
      }
      const classAttr = cls ? ` class="${htmlAttr(cls)}"` : '';
      const styleAttr = style ? ` style="${htmlAttr(style)}"` : '';
      return `<img${classAttr} src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=32" alt=""${styleAttr} />`;
    }

    // Stable chronological compare (newest first). Item ids are usually creation
    // timestamps, but imported backups can carry arbitrary string ids, so a raw
    // `b.id - a.id` yields NaN and leaves the array in an undefined order. Prefer
    // an explicit timestamp, then a numeric id, then a numeric-aware string compare.
    function cmpNewestFirst(a, b) {
      const ta = itemTimestamp(a), tb = itemTimestamp(b);
      if (ta && tb && ta !== tb) return tb - ta;
      const na = Number(a.id), nb = Number(b.id);
      if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return nb - na;
      return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
    }
    function cmpOldestFirst(a, b) { return -cmpNewestFirst(a, b); }

    // Toggle Privacy mode (called from the settings switch). Persists + re-renders.
    function setPrivacyMode(on) {      privacyMode = (on === undefined) ? !privacyMode : !!on;
      try { localStorage.setItem('savemePrivacy', privacyMode ? '1' : '0'); } catch (e) {}
      syncPrivacyToggle();
      updateLibraryIntelStatus();
      refresh();
    }
    function syncPrivacyToggle() {
      const el = document.getElementById('privacyToggle');
      if (!el) return;
      el.classList.toggle('on', privacyMode);
      el.setAttribute('aria-checked', privacyMode ? 'true' : 'false');
      const lbl = el.querySelector('.switch-label');
      if (lbl) lbl.textContent = privacyMode ? 'On' : 'Off';
    }

    function buildCard(item) {
      const div = document.createElement('div');
      div.className = 'link-item' + (item.pinned ? ' pinned' : '');
      div.dataset.id = item.id;
      div.draggable = true;
      const accent = projectColor(item.project);
      if (accent) {
        div.classList.add('has-folder-accent');
        div.style.setProperty('--card-accent', accent);
      }

      div.ondragstart = (e) => {
        dragKind = 'card';
        draggedItemId = item.id;
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
      };
      div.ondragend = () => {
        dragKind = null;
        draggedItemId = null;
        div.classList.remove('dragging');
        div.classList.remove('drop-before', 'drop-after');
      };
      div.ondragover = (e) => {
        if (dragKind !== 'card' || draggedItemId === item.id) return;
        e.preventDefault();
        const r = div.getBoundingClientRect();
        const after = (e.clientY - r.top) > r.height / 2;
        div.classList.toggle('drop-after', after);
        div.classList.toggle('drop-before', !after);
      };
      div.ondragleave = () => div.classList.remove('drop-before', 'drop-after');
      div.ondrop = (e) => {
        if (dragKind !== 'card' || draggedItemId === item.id) return;
        e.preventDefault();
        e.stopPropagation();
        const after = div.classList.contains('drop-after');
        div.classList.remove('drop-before', 'drop-after');
        reorderItem(draggedItemId, item.id, after);
      };

      const tagsHtml = (item.autoTags || []).map(tag =>
        `<span class="tag ${getTagColorClass(tag)}" role="button" tabindex="0" aria-label="Filter by tag ${htmlAttr(tag)}" title="Filter by #${htmlAttr(tag)}" onclick="filterTag('${jsAttr(tag)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();filterTag('${jsAttr(tag)}')}">#${esc(tag)}<button type="button" class="tag-x" title="Remove tag" onclick="event.stopPropagation(); removeTag('${jsAttr(String(item.id))}', '${jsAttr(tag)}')">×</button></span>`
      ).join('');

      const suggHtml = (item.suggestedTags || []).map(tag =>
        `<span class="tag tag-suggested" title="Suggested tag">#${esc(tag)}<button type="button" class="tag-confirm" title="Keep tag" onclick="confirmSuggested('${jsAttr(String(item.id))}', '${jsAttr(tag)}')">✓</button><button type="button" class="tag-x" title="Dismiss" onclick="dismissSuggested('${jsAttr(String(item.id))}', '${jsAttr(tag)}')">×</button></span>`
      ).join('');
      const isHybridResult = !!(searchQuery && librarySearch.ready && librarySearch.query === searchQuery &&
        librarySearch.results.some(result => String(result.itemId == null ? result.id : result.itemId) === String(item.id)));

      div.innerHTML = `
        ${item.pinned ? `<span class="pin-flag" title="Pinned">${ICONS.pin || ICONS.star}</span>` : ''}
        <div class="item-thumb-wrap${privacyMode ? ' thumb-failed' : ''}" data-domain="${esc(item.domain)}">
          <img class="item-thumb" loading="lazy" alt="Preview of ${esc(item.domain)}"
            ${privacyMode ? '' : `data-src="https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=520&h=326"`}
            onerror="this.closest('.item-thumb-wrap').classList.add('thumb-failed')" />
          <div class="item-hover-actions">
            <button type="button" class="meta-btn pin-btn${item.pinned ? ' on' : ''}" title="${item.pinned ? 'Unpin' : 'Pin to top'}" onclick="event.stopPropagation(); togglePin('${jsAttr(String(item.id))}')">${ICONS.pin || ICONS.star}</button>
          </div>
        </div>

        <div class="item-site">
          ${faviconHtml(item.domain, { cls: 'item-favicon' })}
          <a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="item-domain" title="Open link in new tab" onclick="markOpened('${jsAttr(String(item.id))}')">${esc(item.domain)}</a>
          ${item.snoozedUntil && item.snoozedUntil > Date.now() ? `<span class="item-age" title="Snoozed">💤</span>` : ''}
        </div>

        <div class="item-main-content">
          <a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="item-title" title="Open link in new tab" onclick="markOpened('${jsAttr(String(item.id))}')">${esc(item.title)}</a>
          <a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="item-mobile-domain" tabindex="-1" onclick="markOpened('${jsAttr(String(item.id))}')">${esc(item.domain)}</a>
          <div class="item-description">${esc(item.description)}</div>
          <div
            class="item-note"
            contenteditable="true"
            onblur="updateNote('${jsAttr(String(item.id))}', this.innerText)"
            onkeydown="handleNoteKey(event)"
            title="Click to edit note"
          >${item.note ? esc(item.note) : 'Click to add note...'}</div>
        </div>

        <div class="item-meta">
          <span class="tag tag-project" title="Filter by folder" onclick="filterProject('${jsAttr(item.folderId || item.project)}')"><span class="tag-ic"${accent ? ` style="color:${accent}"` : ''}>${projectIconHtml(item.folderId || item.project)}</span>${esc(folderName(item.folderId || item.project))}</span>
          ${tagsHtml}
          ${suggHtml}
          <button type="button" class="tag-add" title="Add tag" onclick="addTagToItem('${jsAttr(String(item.id))}')">+</button>
          ${isHybridResult ? `<button class="search-feedback-btn search-feedback-useful" type="button" aria-label="Mark this result useful" onclick="event.stopPropagation(); markSearchUseful('${jsAttr(String(item.id))}')">Useful</button><button class="search-feedback-btn" type="button" onclick="event.stopPropagation(); markSearchNotRelevant('${jsAttr(String(item.id))}')">Not relevant</button>` : ''}
          <button class="search-feedback-btn related-link-btn" type="button" title="Find related links" onclick="event.stopPropagation(); openRelatedLinks('${jsAttr(String(item.id))}')">Related</button>
          <button type="button" class="meta-btn pin-btn${item.pinned ? ' on' : ''}" title="${item.pinned ? 'Unpin' : 'Pin to top'}" onclick="event.stopPropagation(); togglePin('${jsAttr(String(item.id))}')">${ICONS.pin || ICONS.star}</button>
          <button type="button" class="delete-btn" title="Delete" aria-label="Delete ${htmlAttr(item.title || item.domain || 'link')}" onclick="event.stopPropagation(); deleteItem('${jsAttr(String(item.id))}')">${ICONS.trash}</button>
        </div>
      `;
      return div;
    }

    // ---- Unified Finder list -------------------------------------------------
    // Lines mode uses one hierarchy-aware table instead of a separate folder
    // strip plus bookmark cards. One O(folders + visible links) index keeps
    // imported trees responsive even when they contain dozens of folders.
    function finderItemFolder(item) {
      const id = itemFolderId(item);
      return id && folders[id] ? id : null;
    }

    function buildFinderIndex(visibleItems) {
      const all = allKnownProjects();
      const known = new Set(all);
      const childrenByParent = new Map();
      const linksByFolder = new Map();
      const directCount = new Map();
      const totalCount = new Map();

      const add = (map, key, value) => {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(value);
      };
      for (const id of all) {
        const parent = projectParent[id] && known.has(projectParent[id]) ? projectParent[id] : null;
        add(childrenByParent, parent, id);
      }
      for (const item of visibleItems) {
        if (item.archived) continue;
        add(linksByFolder, finderItemFolder(item), item);
      }
      for (const item of items) {
        if (item.archived) continue;
        const folderId = finderItemFolder(item);
        if (folderId) directCount.set(folderId, (directCount.get(folderId) || 0) + 1);
      }

      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const folderSort = (a, b) => collator.compare(folderName(a), folderName(b));
      childrenByParent.forEach(list => list.sort(folderSort));

      const countFolder = (id, visiting = new Set()) => {
        if (totalCount.has(id)) return totalCount.get(id);
        if (visiting.has(id)) return directCount.get(id) || 0;
        const next = new Set(visiting); next.add(id);
        let total = directCount.get(id) || 0;
        for (const child of childrenByParent.get(id) || []) total += countFolder(child, next);
        totalCount.set(id, total);
        return total;
      };
      all.forEach(id => countFolder(id));
      return { all, childrenByParent, linksByFolder, directCount, totalCount, collator };
    }

    function finderEntryTime(row) {
      return row.type === 'folder'
        ? Number(folders[row.id]?.updatedAt || folders[row.id]?.createdAt || 0)
        : Number(itemTimestamp(row.item) || 0);
    }

    function compareFinderEntries(a, b, index) {
      // Finder keeps folders together. The selected link sort is still applied
      // within each sibling group so navigation remains predictable.
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      if (currentSort === 'oldest') return finderEntryTime(a) - finderEntryTime(b);
      if (currentSort === 'newest') return finderEntryTime(b) - finderEntryTime(a);
      if (currentSort === 'domain' && a.type === 'link') {
        return index.collator.compare(a.item.domain || '', b.item.domain || '');
      }
      if (currentSort === 'custom' && a.type === 'link') {
        return (Number(a.item.order) || 0) - (Number(b.item.order) || 0);
      }
      const an = a.type === 'folder' ? folderName(a.id) : (a.item.title || a.item.domain || '');
      const bn = b.type === 'folder' ? folderName(b.id) : (b.item.title || b.item.domain || '');
      return index.collator.compare(an, bn);
    }

    function flattenFinderRows(visibleItems) {
      // All Links is a link collection, never a folder browser. Folder rows
      // belong only to an opened folder, where they provide inline Finder
      // navigation for that folder's hierarchy.
      const flatOnly = !activeFilter || !!(searchQuery || activeTags.length || pinnedView || recentView);
      if (flatOnly) return visibleItems.map(item => ({ type: 'link', item, depth: 0 }));

      const index = buildFinderIndex(visibleItems);
      const rows = [];
      const scope = activeFilter || null;
      const appendContents = (parentId, depth, path = new Set()) => {
        const entries = [
          ...(index.childrenByParent.get(parentId) || []).map(id => ({ type: 'folder', id, depth })),
          ...(index.linksByFolder.get(parentId) || []).map(item => ({ type: 'link', item, depth })),
        ].sort((a, b) => compareFinderEntries(a, b, index));
        for (const row of entries) {
          if (row.type === 'link') { rows.push(row); continue; }
          if (path.has(row.id)) continue;
          const hasFolders = (index.childrenByParent.get(row.id) || []).length > 0;
          const hasLinks = (index.linksByFolder.get(row.id) || []).length > 0;
          row.hasChildren = hasFolders || hasLinks;
          row.expanded = row.hasChildren && finderExpanded.has(row.id);
          row.directCount = index.directCount.get(row.id) || 0;
          row.totalCount = index.totalCount.get(row.id) || 0;
          rows.push(row);
          if (row.expanded) {
            const nextPath = new Set(path); nextPath.add(row.id);
            appendContents(row.id, depth + 1, nextPath);
          }
        }
      };
      appendContents(scope, 0);
      return rows;
    }

    function bindFinderLinkDrag(div, item) {
      div.draggable = true;
      div.ondragstart = e => {
        dragKind = 'card'; draggedItemId = item.id; div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(item.id));
      };
      div.ondragend = () => {
        dragKind = null; draggedItemId = null;
        div.classList.remove('dragging', 'drop-before', 'drop-after');
      };
      div.ondragover = e => {
        if (dragKind !== 'card' || sameId(draggedItemId, item.id)) return;
        const dragged = items.find(candidate => sameId(candidate.id, draggedItemId));
        if (!dragged || finderItemFolder(dragged) !== finderItemFolder(item)) return;
        e.preventDefault();
        const rect = div.getBoundingClientRect();
        const after = e.clientY - rect.top > rect.height / 2;
        div.classList.toggle('drop-after', after); div.classList.toggle('drop-before', !after);
      };
      div.ondragleave = () => div.classList.remove('drop-before', 'drop-after');
      div.ondrop = e => {
        if (dragKind !== 'card' || sameId(draggedItemId, item.id)) return;
        const dragged = items.find(candidate => sameId(candidate.id, draggedItemId));
        if (!dragged || finderItemFolder(dragged) !== finderItemFolder(item)) return;
        e.preventDefault(); e.stopPropagation();
        const after = div.classList.contains('drop-after');
        div.classList.remove('drop-before', 'drop-after');
        reorderItem(draggedItemId, item.id, after);
      };
    }

    function buildFinderFolderRow(row) {
      const div = document.createElement('div');
      div.className = 'finder-row finder-folder-row';
      div.setAttribute('role', 'row');
      div.dataset.depth = String(row.depth + 1);
      div.dataset.folderId = row.id;
      div.style.setProperty('--finder-depth', String(Math.min(row.depth, 6)));
      const accent = projectColor(row.id);
      if (accent) div.style.setProperty('--folder-accent', accent);
      const modified = folders[row.id]?.updatedAt || folders[row.id]?.createdAt;
      const disclosure = row.hasChildren
        ? `<button type="button" class="finder-disclosure" aria-label="${row.expanded ? 'Collapse' : 'Expand'} ${htmlAttr(folderName(row.id))}" aria-expanded="${row.expanded}" onclick="toggleFinderFolder(event, '${jsAttr(row.id)}')"><span aria-hidden="true">›</span></button>`
        : '<span class="finder-disclosure-spacer" aria-hidden="true"></span>';
      div.innerHTML = `
        <div class="finder-name-cell" role="cell">
          ${disclosure}
          <span class="finder-folder-icon${accent ? ' has-folder-accent' : ''}" aria-hidden="true">${projectIconHtml(row.id)}</span>
          <button type="button" class="finder-folder-button" aria-label="Open folder ${htmlAttr(folderName(row.id))}" onclick="navigateFolder('${jsAttr(row.id)}')"><span>${esc(folderName(row.id))}</span></button>
          <span class="finder-name-meta">${row.totalCount} item${row.totalCount === 1 ? '' : 's'}</span>
        </div>
        <span class="finder-context" role="cell">${modified ? timeAgo(modified) : '—'}</span>
        <span class="finder-added" role="cell">${folders[row.id]?.createdAt ? timeAgo(folders[row.id].createdAt) : '—'}</span>
        <span class="finder-end finder-count" role="cell">${row.totalCount}</span>`;
      div.draggable = true;
      div.ondragstart = e => {
        dragKind = 'project'; draggedName = row.id; e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.id);
      };
      div.ondragend = () => { dragKind = null; draggedName = null; div.classList.remove('sf-drop'); };
      div.ondragover = e => {
        const canMoveCard = dragKind === 'card';
        const canNest = dragKind === 'project' && draggedName !== row.id && !isDescendant(row.id, draggedName);
        if (canMoveCard || canNest) { e.preventDefault(); div.classList.add('sf-drop'); }
      };
      div.ondragleave = () => div.classList.remove('sf-drop');
      div.ondrop = e => {
        e.preventDefault(); e.stopPropagation(); div.classList.remove('sf-drop');
        if (dragKind === 'card' && draggedItemId) {
          const item = items.find(i => sameId(i.id, draggedItemId));
          if (item) { item.project = row.id; item.folderId = row.id; item.projectName = folderName(row.id); dbPut(item); refresh(); }
        } else if (dragKind === 'project' && draggedName) nestProject(draggedName, row.id);
      };
      return div;
    }

    function buildFinderLinkRow(row) {
      const item = row.item;
      const div = document.createElement('div');
      div.className = 'finder-row finder-link-row' + (item.pinned ? ' pinned' : '');
      div.dataset.id = item.id;
      div.setAttribute('role', 'row');
      div.dataset.depth = String(row.depth + 1);
      div.style.setProperty('--finder-depth', String(Math.min(row.depth, 6)));
      bindFinderLinkDrag(div, item);
      const folderLabel = folderName(finderItemFolder(item));
      div.innerHTML = `
        <div class="finder-name-cell" role="cell">
          <span class="finder-disclosure-spacer" aria-hidden="true"></span>
          ${faviconHtml(item.domain, { cls: 'finder-link-favicon' })}
          <a class="finder-link-anchor" href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" onclick="markOpened('${jsAttr(String(item.id))}')"><span>${esc(item.title || item.domain || item.url)}</span></a>
          <span class="finder-name-meta">${esc(item.domain || '')}${folderLabel ? ` · ${esc(folderLabel)}` : ''}</span>
        </div>
        <span class="finder-context" role="cell">${esc(item.domain || '—')}</span>
        <span class="finder-added" role="cell">${timeAgo(itemTimestamp(item))}</span>
        <span class="finder-end finder-row-actions" role="cell">
          <button type="button" class="finder-action${item.pinned ? ' on' : ''}" title="${item.pinned ? 'Unpin' : 'Pin'}" aria-label="${item.pinned ? 'Unpin' : 'Pin'} ${htmlAttr(item.title || item.domain || 'link')}" aria-pressed="${item.pinned ? 'true' : 'false'}" onclick="event.stopPropagation(); togglePin('${jsAttr(String(item.id))}')">${ICONS.pin || ICONS.star}</button>
          <button type="button" class="finder-action finder-delete" title="Delete" aria-label="Delete ${htmlAttr(item.title || item.domain || 'link')}" onclick="event.stopPropagation(); deleteItem('${jsAttr(String(item.id))}')">${ICONS.trash}</button>
        </span>`;
      return div;
    }

    function renderNextFinderChunk() {
      const body = document.querySelector('#linkList .finder-body');
      const scroller = document.querySelector('.content-scroll');
      if (!body || !scroller) return;
      if (_io) { _io.disconnect(); _io = null; }
      const oldSentinel = document.getElementById('scroll-sentinel');
      if (oldSentinel) oldSentinel.remove();
      const end = Math.min(_finderRendered + CHUNK, _finderRows.length);
      const fragment = document.createDocumentFragment();
      for (let i = _finderRendered; i < end; i++) {
        const row = _finderRows[i];
        fragment.appendChild(row.type === 'folder' ? buildFinderFolderRow(row) : buildFinderLinkRow(row));
      }
      body.appendChild(fragment);
      _finderRendered = end;
      if (_finderRendered < _finderRows.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel'; sentinel.className = 'scroll-sentinel';
        sentinel.textContent = `Loading more… (${_finderRendered} of ${_finderRows.length})`;
        scroller.appendChild(sentinel);
        _io = new IntersectionObserver(entries => {
          if (entries.some(entry => entry.isIntersecting)) renderNextFinderChunk();
        }, { root: scroller, rootMargin: '600px' });
        _io.observe(sentinel);
      }
    }

    function renderFinderList(itemList) {
      const list = document.getElementById('linkList');
      _finderRows = flattenFinderRows(itemList);
      _finderRendered = 0;
      if (!_finderRows.length) return false;
      list.classList.add('finder-active');
      list.innerHTML = `<div class="finder-table" role="table" aria-label="Library contents" aria-colcount="4" aria-rowcount="${_finderRows.length + 1}" onkeydown="handleFinderKey(event)">
        <div class="finder-header" role="row">
          <span role="columnheader">Name</span>
          <span role="columnheader">Website / Modified</span>
          <span role="columnheader">Added</span>
          <span role="columnheader">Items</span>
        </div>
        <div class="finder-body" role="rowgroup"></div>
      </div>`;
      renderNextFinderChunk();
      return true;
    }

    function toggleFinderFolder(event, folderId) {
      event.preventDefault(); event.stopPropagation();
      if (finderExpanded.has(folderId)) finderExpanded.delete(folderId); else finderExpanded.add(folderId);
      renderItems(getVisibleItems());
      requestAnimationFrame(() => document.querySelector(`.finder-folder-row[data-folder-id="${CSS.escape(folderId)}"] .finder-disclosure`)?.focus());
    }

    function renderNextChunk() {
      const list = document.getElementById('linkList');
      const scroller = document.querySelector('.content-scroll');
      const oldSentinel = document.getElementById('scroll-sentinel');
      if (oldSentinel) oldSentinel.remove();

      const end = Math.min(_rendered + CHUNK, _visible.length);
      const frag = document.createDocumentFragment();
      for (let i = _rendered; i < end; i++) frag.appendChild(buildCard(_visible[i]));
      list.appendChild(frag);
      _rendered = end;
      activateThumbs();

      if (_rendered < _visible.length) {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.className = 'scroll-sentinel';
        sentinel.textContent = `Loading more… (${_rendered} of ${_visible.length})`;
        scroller.appendChild(sentinel);
        if (!_io) {
          _io = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) renderNextChunk();
          }, { root: scroller, rootMargin: '600px' });
        }
        _io.observe(sentinel);
      }
    }

    function renderItems(itemList) {
      const list = document.getElementById('linkList');
      list.classList.remove('finder-active');
      list.innerHTML = '';
      const stale = document.getElementById('scroll-sentinel');
      if (stale) stale.remove();
      if (_io) { _io.disconnect(); _io = null; }
      _visible = itemList;
      _rendered = 0;
      const liveCount = liveLibraryItems().length;
      document.getElementById('count-all').innerText = liveCount;

      updateContainerClasses();
      // All Links and smart views render a flat link-only Finder table.
      // An opened folder can legitimately contain only empty subfolders, so
      // its mixed Finder model must be built before deciding it is empty.
      if (currentLayout === 'list' && renderFinderList(itemList)) return;

      // Empty states (#4)
      if (!itemList.length) {
        const noneAtAll = liveCount === 0;
        const showClear = !noneAtAll && (activeFilter || activeTags.length || searchQuery || pinnedView || recentView);
        const folderTagMismatch = !noneAtAll && !!activeFilter && activeTags.length > 0 && !searchQuery;
        const tagLabel = activeTags.map(tag => `#${tag}`).join(tagMode === 'and' ? ' + ' : ' or ');
        const msg = noneAtAll
          ? 'Paste a URL in the top bar and press Enter to save your first bookmark.'
          : (searchQuery ? 'No links match your search. Try fewer words, or filters like tag:react, site:github.com, or is:pinned.'
            : pinnedView ? 'No pinned links yet. Click the pin icon on any card to keep it handy here.'
            : recentView ? 'No links yet — the ones you save will appear here newest-first.'
            : folderTagMismatch ? `The ${esc(folderName(activeFilter))} folder has links, but none match ${esc(tagLabel)}. Clear the tag filter to see the folder contents.`
            : 'Nothing filed here yet.');
        const wrap = document.createElement('div');
        wrap.className = 'empty-state';
        wrap.innerHTML = `
          <div class="empty-art">
            <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="24" y="18" width="72" height="84" rx="10" fill="var(--brand-soft)" stroke="var(--brand-primary)" stroke-width="2.5"/>
              <path d="M60 18v40l-11-8-11 8V18" fill="var(--card-bg,#fff)" stroke="var(--brand-primary)" stroke-width="2.5" stroke-linejoin="round"/>
              <line x1="36" y1="74" x2="84" y2="74" stroke="var(--brand-primary)" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>
              <line x1="36" y1="86" x2="72" y2="86" stroke="var(--brand-primary)" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>
            </svg>
          </div>
          <div class="empty-title">${noneAtAll ? 'Start saving links' : pinnedView ? 'No pinned links' : recentView ? 'Nothing here yet' : folderTagMismatch ? `No links match ${esc(tagLabel)}` : 'No results'}</div>
          <div class="empty-sub">${msg}</div>
          ${folderTagMismatch
            ? '<button class="empty-btn" onclick="clearTags()">Clear tag filters</button>'
            : showClear ? '<button class="empty-btn" onclick="showAll()">Back to all links</button>' : ''}
        `;
        list.appendChild(wrap);
        return;
      }

      renderNextChunk();
    }

    function updateNote(id, newText) {
      const item = items.find(i => sameId(i.id, id));
      if (item) {
        item.note = newText.trim();
        dbPut(item);
      }
    }

    function handleNoteKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
    }

    // ---- Central render pipeline (#8 sort, #10 tag filter, #5 empty states) ----
    // A tag filter matches its whole branch: filtering "dev" also catches "dev/frontend".
    function tagMatches(set, t) { return set.some(x => x === t || x.startsWith(t + '/')); }

    // ---- Smart search ----------------------------------------------------
    // Ranked, typo-tolerant search with field weighting and operators:
    //   tag:react  site:github.com  in:"Side projects"  is:pinned  "exact phrase"
    // Free words are AND-matched (each must hit some field) with fuzzy fallback,
    // and results are ordered by relevance rather than the chosen sort.
    const SEARCH_FIELDS = [
      ['title', 10], ['domain', 8], ['tags', 7], ['project', 6],
      ['description', 4], ['note', 4], ['content', 2], ['url', 3],
    ];
    function _itemFieldText(it, field) {
      switch (field) {
        case 'title': return it.title || '';
        case 'domain': return it.domain || '';
        case 'tags': return (it.autoTags || []).concat(it.suggestedTags || []).join(' ');
        case 'project': return it.projectName || folderName(it.folderId || it.project) || '';
        case 'description': return it.description || '';
        case 'note': return it.note || '';
        case 'content': return it.contentText || '';
        case 'url': return it.url || '';
      }
      return '';
    }
    // Levenshtein distance, capped small (typo tolerance only).
    function _lev(a, b) {
      if (a === b) return 0;
      const m = a.length, n = b.length;
      if (!m) return n; if (!n) return m;
      let prev = Array.from({ length: n + 1 }, (_, i) => i);
      for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = cur;
      }
      return prev[n];
    }
    // Strength (0..1) of one query token against one word.
    function _fuzzyWord(token, word) {
      if (!word) return 0;
      if (word === token) return 1;
      if (word.startsWith(token)) return 0.9;
      if (word.includes(token)) return 0.78;
      if (token.length >= 4) {
        const d = _lev(token, word);
        if (d === 1) return 0.68;
        if (d === 2 && token.length >= 6) return 0.5;
      }
      return 0;
    }
    // Best strength (0..1) of a token against a whole field.
    function _fieldScore(token, text) {
      if (!text) return 0;
      const low = normalizeSearchConcept(text);
      if (low === token) return 1;
      if (low.includes(token)) return low.startsWith(token) ? 0.95 : 0.82;
      let best = 0;
      for (const w of low.split(/[^\p{L}\p{N}]+/u)) {
        if (!w) continue;
        const s = _fuzzyWord(token, w);
        if (s > best) best = s;
        if (best === 1) break;
      }
      return best;
    }
    function parseSearchQuery(q) {
      const filters = { tag: [], site: [], project: [], pinned: false };
      const phrases = [];
      let rest = q;
      rest = rest.replace(/"([^"]+)"/g, (_, p) => { phrases.push(p.toLowerCase().trim()); return ' '; });
      rest = rest.replace(/\b(tag|site|domain|in|folder|project|is):(\S+)/gi, (_, k, v) => {
        k = k.toLowerCase(); v = v.toLowerCase();
        if (k === 'tag') filters.tag.push(v);
        else if (k === 'site' || k === 'domain') filters.site.push(v);
        else if (k === 'in' || k === 'folder' || k === 'project') filters.project.push(v);
        else if (k === 'is' && v === 'pinned') filters.pinned = true;
        return ' ';
      });
      const tokens = rest.normalize('NFKC').toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      return { filters, phrases, tokens };
    }
    // Local/offline semantic recall. Every query word must still match, while
    // this one expands only true multilingual/transliterated equivalents.
    // Thus “movie” can find kino.watch, but “online tv” cannot return a
    // generic Amazon account page just because it mentions “online”.
    function _conceptScore(token, text) {
      const normalized = normalizeSearchConcept(token);
      let best = 0;
      for (const alias of conceptAliasesForToken(normalized)) {
        const score = _fieldScore(alias, text);
        if (!score) continue;
        const weighted = alias === normalized ? score : score * 0.78;
        if (weighted > best) best = weighted;
      }
      return best;
    }
    function scoreSearchItem(it, parsed) {
      const { filters, phrases, tokens } = parsed;
      const tags = (it.autoTags || []).concat(it.suggestedTags || []).map(t => t.toLowerCase());
      for (const t of filters.tag) if (!tags.some(x => x.includes(t))) return 0;
      for (const s of filters.site) if (!(it.domain || '').toLowerCase().includes(s)) return 0;
      for (const p of filters.project) if (!(it.projectName || folderName(it.folderId || it.project)).toLowerCase().includes(p)) return 0;
      if (filters.pinned && !it.pinned) return 0;
      if (phrases.length) {
        const combined = SEARCH_FIELDS.map(([f]) => _itemFieldText(it, f)).join('  ').toLowerCase();
        for (const ph of phrases) if (ph && !combined.includes(ph)) return 0;
      }
      const hadFilter = filters.tag.length || filters.site.length || filters.project.length || filters.pinned || phrases.length;
      if (!tokens.length) return hadFilter ? 1 : 0;
      let total = 0;
      for (const tok of tokens) {
        let best = 0;
        for (const [f, w] of SEARCH_FIELDS) {
          const s = _conceptScore(tok, _itemFieldText(it, f));
          if (s > 0) { const c = s * w; if (c > best) best = c; }
        }
        if (best === 0) return 0; // every word must land somewhere (AND)
        total += best;
      }
      return total + (hadFilter ? 2 : 0);
    }

    function getVisibleItems() {
      let out = items.slice();
      // Archived links stay hidden from every view.
      out = out.filter(i => !i.archived);

      if (pinnedView) out = out.filter(i => i.pinned);

      if (activeFilter) {
        // Include the project itself + all its sub-folders (descendants).
        const all = allKnownProjects();
        const wanted = new Set([activeFilter]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const p of all) { if (projectParent[p] && wanted.has(projectParent[p]) && !wanted.has(p)) { wanted.add(p); grew = true; } }
        }
        out = out.filter(i => wanted.has(itemFolderId(i)));
      }
      if (activeTags.length) {
        const lows = activeTags.map(t => t.toLowerCase());
        out = out.filter(i => {
          const set = (i.autoTags || []).map(t => t.toLowerCase());
          return tagMode === 'and' ? lows.every(t => tagMatches(set, t)) : lows.some(t => tagMatches(set, t));
        });
      }
      let searchRanked = false;
      if (searchQuery) {
        if (hybridSearchEnabled && librarySearch.ready && librarySearch.query === searchQuery) {
          const allowed = new Map(out.map(it => [String(it.id), it]));
          out = librarySearch.results
            .map((result, index) => {
              const item = allowed.get(String(result.itemId == null ? result.id : result.itemId));
              if (item) item._score = Number(result.score) || (librarySearch.results.length - index);
              return item;
            })
            .filter(Boolean);
        } else {
          const parsed = parseSearchQuery(searchQuery);
          const scored = [];
          for (const it of out) {
            const sc = scoreSearchItem(it, parsed);
            if (sc > 0) { it._score = sc; scored.push(it); }
          }
          out = scored;
        }
        searchRanked = true;
      }
      if (searchRanked) {
        // While searching, relevance beats the chosen sort.
        out.sort((a, b) => (b._score - a._score) || cmpNewestFirst(a, b));
      } else {
        switch (currentSort) {
          case 'oldest': out.sort(cmpOldestFirst); break;
          case 'title':  out.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))); break;
          case 'domain': out.sort((a, b) => String(a.domain || '').localeCompare(String(b.domain || ''))); break;
          case 'custom': out.sort((a, b) => {
            const ao = a.order, bo = b.order;
            if (ao != null && bo != null) return ao - bo;
            return cmpNewestFirst(a, b);
          }); break;
          default:       out.sort(cmpNewestFirst); // newest
        }
      }
      // "Recently Added" always shows the newest links first, capped, and skips
      // the pinned-float below so it stays a pure chronological view.
      if (recentView) {
        out.sort(cmpNewestFirst);
        if (recentWindow) {
          const now = Date.now();
          out = out.filter(i => (now - (i.added || i.id || 0)) <= recentWindow * DAY_MS);
        }
        return recentShowAll ? out : out.slice(0, RECENT_LIMIT);
      }
      // Pinned links float to the top (stable within each group) — but not while
      // searching, where relevance ordering wins.
      if (!searchRanked && out.some(i => i.pinned)) out = out.filter(i => i.pinned).concat(out.filter(i => !i.pinned));
      return out;
    }

    // Drag-reorder links only among siblings. A reorder must never rewrite the
    // whole cloud library or silently move a link between folders.
    function reorderItem(draggedId, targetId, placeAfter) {
      if (sameId(draggedId, targetId)) return;
      const moved = items.find(item => sameId(item.id, draggedId));
      const target = items.find(item => sameId(item.id, targetId));
      if (!moved || !target || itemFolderId(moved) !== itemFolderId(target)) return;
      const siblings = items
        .filter(item => !item.archived && itemFolderId(item) === itemFolderId(moved))
        .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      const from = siblings.findIndex(item => sameId(item.id, draggedId));
      if (from < 0) return;
      siblings.splice(from, 1);
      let to = siblings.findIndex(item => sameId(item.id, targetId));
      if (to < 0) return;
      if (placeAfter) to += 1;
      siblings.splice(to, 0, moved);
      const changed = [];
      siblings.forEach((item, index) => {
        if (item.order !== index) { item.order = index; changed.push(item); }
      });
      currentSort = 'custom';
      if (typeof markActiveSort === 'function') markActiveSort();
      dbPutMany(changed);
      dbSaveProjects();
      refresh();
    }

    function refresh() {
      // Sync and legacy imports can briefly introduce the same URL under two
      // different ids. Never expose that transient state in counts or rows.
      consolidateStoredDuplicates();
      renderItems(getVisibleItems());
      renderSidebar();
      renderSubfolderBar();
    }

    // Sub-folders live here (not in the sidebar): a header with the project, its
    // actions, and its direct sub-folders as cards. Lives in the light content area.
    function renderSubfolderBar() {
      const bar = document.getElementById('subfolderBar');
      if (!bar) return;
      // Smart view headers for the two library views.
      if (recentView) { renderRecentBanner(bar); return; }
      if (pinnedView) { renderPinnedBanner(bar); return; }
      if (!activeFilter) {
        // Smart "All Links" overview — only on the clean root view (no tag/search filter).
        if (activeTags.length || searchQuery) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
        renderAllOverview(bar);
        return;
      }
      const all = allKnownProjects();
      const counts = folderDirectCounts();

      // Ancestor chain (root → … → current).
      const chain = [];
      let p = activeFilter, guard = new Set();
      while (p && !guard.has(p)) { chain.unshift(p); guard.add(p); p = (projectParent[p] && all.includes(projectParent[p])) ? projectParent[p] : null; }
      const cur = activeFilter;
      const isPri = priorityProjects.has(cur);
      const total = rollupCount(cur, counts, all);
      const curAccent = projectColor(cur);

      let html = '<div class="sf-head">';

      // Left: Finder-style clickable location path + current folder name.
      html += '<div class="sf-id">';
      html += `<div class="sf-badge${isPri ? ' pri' : ''}${curAccent ? ' has-folder-accent' : ''}"${curAccent ? ` style="--folder-accent:${curAccent}"` : ''}>${projectIconHtml(cur)}</div>`;
      html += '<div class="sf-id-text">';
      const CH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
      let path = '<button class="sf-pcrumb sf-pcrumb-home" onclick="showAll()" title="All links"><span>All Links</span></button>';
      chain.forEach((name, index) => {
        const current = index === chain.length - 1;
        path += `<span class="sf-psep">${CH}</span>${current
          ? `<span class="sf-pcrumb current" aria-current="location"><span>${esc(folderName(name))}</span></span>`
          : `<button class="sf-pcrumb" onclick="navigateFolder('${jsAttr(name)}')"><span>${esc(folderName(name))}</span></button>`}`;
      });
      html += `<nav class="sf-path" aria-label="Folder path">${path}</nav>`;
      html += `<div class="sf-name-row"><span class="sf-name">${esc(folderName(cur))}</span><span class="sf-count-badge">${total}</span></div>`;
      html += '</div></div>';

      // Right: grouped action buttons — safe actions, a divider, then Delete.
      html += `<div class="sf-actions">
        <button class="sf-act sf-act-new" data-tip="New subfolder" aria-label="Create a subfolder inside ${htmlAttr(folderName(cur))}" onclick="addSubfolder(event, '${jsAttr(cur)}')">${ICONS.folderPlus}</button>
        <button class="sf-act${isPri ? ' on' : ''}" data-tip="${isPri ? 'Remove priority' : 'Mark as priority'}" aria-label="${isPri ? 'Remove priority' : 'Mark as priority'}" onclick="togglePriority(event, '${jsAttr(cur)}')">${ICONS.star}</button>
        <button class="sf-act" data-tip="Icon & color" aria-label="Icon & color" onclick="openFolderCustomize(event, '${jsAttr(cur)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="16" cy="15" r="2.5"/><circle cx="8" cy="19" r="2"/></svg></button>
        <button class="sf-act" data-tip="Rename folder" aria-label="Rename folder" onclick="renameProject(event, '${jsAttr(cur)}')">${ICONS.edit}</button>
        <span class="sf-act-sep" aria-hidden="true"></span>
        <button class="sf-act sf-act-danger" data-tip="Delete folder" aria-label="Delete folder" onclick="deleteProject(event, '${jsAttr(cur)}')">${ICONS.trash}</button>
      </div>`;
      html += '</div>';

      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    // Smart view header for "Pinned Links" — icon badge, live count, hint.
    function renderPinnedBanner(bar) {
      const n = items.filter(i => i.pinned && !i.archived).length;
      let html = '<div class="sf-head sf-head-smart">';
      html += '<nav class="sf-path" aria-label="Library view">';
      html += '<button class="sf-pcrumb" onclick="showAll()"><span>All Links</span></button>';
      html += '<span class="sf-psep" aria-hidden="true">›</span>';
      html += `<span class="sf-pcrumb current" aria-current="location"><span>Pinned Links</span><span class="sf-pcrumb-count">${n}</span></span>`;
      html += '</nav></div>';
      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    // Smart view header for "Recently Added" — newest count + live time-bucket stats.
    function renderRecentBanner(bar) {
      const live = items.filter(i => !i.archived);
      const now = Date.now();
      const within = d => live.filter(i => (now - (i.added || i.id || 0)) <= d * DAY_MS).length;
      const today = within(1), week = within(7), month = within(30);
      const total = recentWindow ? within(recentWindow) : live.length;
      const shown = recentShowAll ? total : Math.min(RECENT_LIMIT, total);
      let html = '<div class="sf-head sf-head-smart">';
      html += '<nav class="sf-path" aria-label="Library view">';
      html += '<button class="sf-pcrumb" onclick="showAll()"><span>All Links</span></button>';
      html += '<span class="sf-psep" aria-hidden="true">›</span>';
      html += `<span class="sf-pcrumb current" aria-current="location"><span>Recently Added</span><span class="sf-pcrumb-count">${total}</span></span>`;
      html += `</nav><span class="visually-hidden">${recentShowAll ? `Showing all ${total}` : `Showing ${shown} newest of ${total}`} link${total === 1 ? '' : 's'}, chronological</span></div>`;
      html += '<div class="sf-chips">';
      html += '<span class="sf-label">Added</span>';
      html += `<button class="sf-stat${recentWindow === 1 ? ' active' : ''}" onclick="setRecentWindow(1)"><span class="sf-stat-n">${today}</span> today</button>`;
      html += `<button class="sf-stat${recentWindow === 7 ? ' active' : ''}" onclick="setRecentWindow(7)"><span class="sf-stat-n">${week}</span> this week</button>`;
      html += `<button class="sf-stat${recentWindow === 30 ? ' active' : ''}" onclick="setRecentWindow(30)"><span class="sf-stat-n">${month}</span> this month</button>`;
      if (total > RECENT_LIMIT) html += `<button class="sf-stat sf-stat-clear" onclick="toggleRecentShowAll()">${recentShowAll ? `Show newest ${RECENT_LIMIT}` : `Show all ${total}`}</button>`;
      if (recentWindow) html += `<button class="sf-stat sf-stat-clear" onclick="clearRecentWindow()">Clear ✕</button>`;
      html += '</div>';
      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    // Toggle a time window on the Recently Added view (click same chip to clear).
    function setRecentWindow(d) {
      recentWindow = (recentWindow === d) ? 0 : d;
      recentShowAll = false;
      refresh();
    }
    function clearRecentWindow() {
      recentWindow = 0;
      recentShowAll = false;
      refresh();
    }
    function toggleRecentShowAll() {
      recentShowAll = !recentShowAll;
      refresh();
    }

    // Compact location header for the flat All Links collection. Folder
    // navigation lives in the sidebar and inside opened folders; it is never
    // inserted into the All Links results.
    function renderAllOverview(bar) {
      const GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

      let html = '<div class="sf-head"><div class="sf-id">';
      html += `<div class="sf-badge sf-badge-all">${GRID}</div>`;
      html += '<div class="sf-id-text">';
      html += `<nav class="sf-path" aria-label="Folder path"><span class="sf-pcrumb sf-pcrumb-home current" aria-current="location"><span>All Links</span></span></nav>`;
      html += `<div class="sf-name-row"><span class="sf-name">All Links</span><span class="sf-count-badge">${liveLibraryItems().length}</span></div>`;
      html += '</div></div>';
      html += `<div class="sf-actions"><button class="sf-act sf-act-new" data-tip="New folder" aria-label="New folder" onclick="addNewProject()">${ICONS.folderPlus}</button></div>`;
      html += '</div>';

      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    function setSort(value) {
      currentSort = value;
      refresh();
    }

    // Numeric for backward compatibility with existing inline handlers and IDB
    // keys, but collision-resistant across rapid saves and multiple tabs.
    let _lastGeneratedId = 0;
    function newItemId() {
      const random = new Uint16Array(1);
      crypto.getRandomValues(random);
      const candidate = Date.now() * 1000 + (random[0] % 1000);
      _lastGeneratedId = Math.max(candidate, _lastGeneratedId + 1);
      return _lastGeneratedId;
    }

    // ---- Input / save (#6 duplicate detection) ----
    function parseSaveUrl(value) {
      let candidate = String(value || '').trim();
      if (!candidate || /\s/.test(candidate)) return null;
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) {
        if (!candidate.includes('.')) return null;
        candidate = 'https://' + candidate;
      }
      try {
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
        return parsed;
      } catch (_) { return null; }
    }

    function openSafeHttpUrl(value) {
      const target = safeHttpUrl(value);
      if (!target) return false;
      window.open(target, '_blank', 'noopener,noreferrer');
      return true;
    }

    function saveUrlToLibrary(value, options = {}) {
      const parsedUrl = parseSaveUrl(value);
      if (!parsedUrl) return { ok: false, reason: 'invalid' };
      const canonicalUrl = parsedUrl.href;
      const norm = normalizeUrl(canonicalUrl);
      const existing = items.find(item => normalizeUrl(item.url) === norm);
      if (existing) return { ok: false, reason: 'duplicate', item: existing };
      const fallbackTitle = prettifyTitle(parsedUrl.pathname, parsedUrl.hostname);
      const niceTitle = String(options.title || '').trim() || fallbackTitle;
      const meta = generateLinkMetadata(canonicalUrl, parsedUrl.hostname, parsedUrl.pathname, niceTitle);
      const requestedProject = String(options.project || '').trim();
      const suggested = requestedProject || activeFilter || chooseProject(meta, parsedUrl.hostname);
      const project = folders[suggested] ? suggested : ensureProject(suggested, false, { kind: requestedProject || activeFilter ? 'manual' : 'smart' });
      const newItem = {
        id: newItemId(), added: Date.now(), url: canonicalUrl, title: niceTitle,
        domain: parsedUrl.hostname, description: meta.description,
        autoTags: meta.autoTags, suggestedTags: meta.suggestedTags || [],
        note: 'Click to add note...', project, projectName: folderName(project), folderId: project,
        folderSource: requestedProject || activeFilter ? 'manual' : 'smart'
      };
      items.unshift(newItem);
      dbPut(newItem);
      refresh();
      flashItem(newItem.id);
      queueItemEnrichment(newItem);
      return { ok: true, item: newItem };
    }

    function handleInput(e) {
      if (e.key !== 'Enter') return;
      const value = e.target.value.trim();
      if (!value) return;
      const parsed = parseSaveUrl(value);
      if (!parsed) {
        if (/^(?:ask|question):\s*/i.test(value) || value.endsWith('?')) {
          runSmartSearchAction('ask');
        }
        return; // ordinary Enter keeps the live smart-search results visible
      }
      const saved = saveUrlToLibrary(parsed.href);
      if (!saved.ok && saved.reason === 'duplicate') {
        activeFilter = null; activeTags = []; searchQuery = '';
        document.getElementById('searchInput').value = '';
        refresh();
        flashItem(saved.item.id);
        showToast('Already saved — highlighting it');
        e.target.value = '';
        return;
      }
      e.target.value = '';
      showToast('Saved to your smart library');
    }

    function openSaveLink(initialUrl = '') {
      closeNav();
      closeHeaderMenu();
      const overlay = document.getElementById('saveLinkOverlay');
      const select = document.getElementById('saveLinkProject');
      if (!overlay || !select) return;
      const availableFolders = allKnownProjects().sort((a, b) => folderName(a).localeCompare(folderName(b)));
      select.replaceChildren(new Option('Automatic smart folder', ''));
      availableFolders.forEach(folder => select.add(new Option(folderName(folder), folder)));
      if (activeFilter && availableFolders.includes(activeFilter)) select.value = activeFilter;
      document.getElementById('saveLinkUrl').value = initialUrl;
      document.getElementById('saveLinkTitle').value = '';
      document.getElementById('saveLinkStatus').textContent = '';
      overlay.classList.add('show');
      setTimeout(() => document.getElementById('saveLinkUrl').focus(), 50);
    }

    function closeSaveLink() {
      const overlay = document.getElementById('saveLinkOverlay');
      if (overlay) overlay.classList.remove('show');
    }

    function submitSaveLink(event) {
      if (event) event.preventDefault();
      const urlInput = document.getElementById('saveLinkUrl');
      const status = document.getElementById('saveLinkStatus');
      const saved = saveUrlToLibrary(urlInput.value, {
        title: document.getElementById('saveLinkTitle').value,
        project: document.getElementById('saveLinkProject').value
      });
      if (!saved.ok) {
        if (saved.reason === 'duplicate') {
          status.textContent = 'Already saved — opening the existing link.';
          closeSaveLink();
          flashItem(saved.item.id);
        } else {
          status.textContent = 'Enter a valid website address, for example example.com/article.';
          urlInput.focus();
        }
        return;
      }
      closeSaveLink();
      showToast('Saved · smart tags and indexing are running');
    }

    function updateSearchModeButton() {
      const btn = document.getElementById('searchModeBtn');
      if (!btn) return;
      btn.classList.toggle('active', hybridSearchEnabled);
      btn.classList.toggle('loading', librarySearch.loading);
      btn.setAttribute('aria-pressed', hybridSearchEnabled ? 'true' : 'false');
      btn.title = hybridSearchEnabled
        ? (cloud.mode ? 'Hybrid search: keywords + meaning' : 'Hybrid search will activate after sign-in')
        : 'Local keyword search';
    }

    function toggleSearchMode() {
      hybridSearchEnabled = !hybridSearchEnabled;
      try { localStorage.setItem('savemeHybridSearch', hybridSearchEnabled ? '1' : '0'); } catch (e) {}
      if (!hybridSearchEnabled && librarySearch.controller) librarySearch.controller.abort();
      librarySearch.query = '';
      librarySearch.results = [];
      librarySearch.ready = false;
      librarySearch.loading = false;
      updateSearchModeButton();
      refresh();
      if (hybridSearchEnabled && searchQuery) scheduleLibrarySearch(searchQuery);
    }

    function scheduleLibrarySearch(query) {
      clearTimeout(librarySearchTimer);
      if (librarySearch.controller) librarySearch.controller.abort();
      librarySearch.loading = false;
      librarySearch.ready = false;
      librarySearch.query = '';
      librarySearch.results = [];
      updateSearchModeButton();
      if (!hybridSearchEnabled || !cloud.mode || String(query || '').trim().length < 2) return;
      // Advanced local operators have client-side semantics; keep those searches
      // local instead of asking the semantic endpoint to reinterpret their syntax.
      if (/\b(?:tag|site|domain|in|folder|project|is):/i.test(query) || String(query).includes('"')) return;
      librarySearchTimer = setTimeout(() => runLibrarySearch(query), 650);
    }

    async function runLibrarySearch(query) {
      const expected = String(query || '').trim();
      if (!expected || expected !== searchQuery || !cloud.mode || !hybridSearchEnabled) return;
      const controller = new AbortController();
      librarySearch.controller = controller;
      librarySearch.loading = true;
      updateSearchModeButton();
      try {
        const url = '/api/library/search?q=' + encodeURIComponent(expected) + '&mode=hybrid&limit=30';
        const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!response.ok) throw new Error('Library search failed (' + response.status + ')');
        const data = await response.json();
        if (expected !== searchQuery || controller.signal.aborted) return;
        librarySearch.query = expected;
        librarySearch.results = Array.isArray(data.results) ? data.results : [];
        librarySearch.ready = true;
        refresh();
      } catch (error) {
        if (error && error.name !== 'AbortError') console.warn('Hybrid search unavailable; using local search', error);
      } finally {
        if (librarySearch.controller === controller) {
          librarySearch.controller = null;
          librarySearch.loading = false;
          updateSearchModeButton();
        }
      }
    }

    const sentSearchFeedback = new Map();
    async function sendSearchFeedback(itemId, signal, options = {}) {
      const query = String(searchQuery || '').trim();
      if (!query || !cloud.mode) return false;
      const fingerprint = `${query.toLocaleLowerCase()}\u0000${itemId}\u0000${signal}`;
      const sentAt = sentSearchFeedback.get(fingerprint) || 0;
      if (Date.now() - sentAt < 60_000) return true;
      sentSearchFeedback.set(fingerprint, Date.now());
      try {
        const response = await fetch('/api/library/search-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ query, itemId: String(itemId), signal })
        });
        if (!response.ok) throw new Error(`Search feedback failed (${response.status})`);
        if (!options.quiet) showToast(signal === 'relevant' ? 'Search improved from your feedback' : 'Result hidden for this search');
        return true;
      } catch (error) {
        sentSearchFeedback.delete(fingerprint);
        console.warn('Could not sync search feedback', error);
        return false;
      }
    }

    function markSearchUseful(itemId) {
      sendSearchFeedback(itemId, 'relevant');
    }

    function markSearchNotRelevant(itemId) {
      const query = String(searchQuery || '').trim();
      if (!query) return;
      librarySearch.results = librarySearch.results.filter(result =>
        String(result.itemId == null ? result.id : result.itemId) !== String(itemId));
      refresh();
      showToast('Result hidden for this search');
      sendSearchFeedback(itemId, 'not_relevant', { quiet: true });
    }

    function openRelatedLinks(itemId) {
      const item = items.find(entry => String(entry.id) === String(itemId));
      if (!item) return;
      const topic = item.title || item.domain;
      openLibraryAsk(`Find links related to "${topic}" and explain the connection.`);
      setTimeout(() => submitLibraryAsk(), 80);
    }

    // Coalesce the library-wide local re-render so a fast typist does not run
    // scoreSearchItem across the whole collection on every keystroke (which
    // blocks the main thread / spikes INP on large libraries). State is still
    // updated synchronously; only the expensive render is batched.
    let _searchRefreshTimer = null;
    function scheduleSearchRefresh() {
      if (_searchRefreshTimer) return;
      _searchRefreshTimer = setTimeout(() => { _searchRefreshTimer = null; refresh(); }, 90);
    }

    document.getElementById('searchInput').addEventListener('input', (e) => {
      const raw = e.target.value.trim();
      updateSmartSearchActions(raw);
      const bar = document.getElementById('searchBar');
      if (bar) bar.classList.toggle('has-text', !!e.target.value);
      if (raw.startsWith('http')) { searchQuery = ''; projectQuery = ''; renderSidebarProjects(); return; }
      // Header search is library-wide by design. Folder, tag, pinned, and
      // recent views must never silently hide otherwise relevant results.
      if (raw) {
        activeFilter = null;
        activeTags = [];
        pinnedView = false;
        recentView = false;
      }
      searchQuery = raw;
      // Header search is library-wide. Keep the folder tree stable and visible;
      // finding a link must never make its navigation disappear.
      projectQuery = '';
      scheduleSearchRefresh();
      scheduleLibrarySearch(raw);
      clearTimeout(_searchNavTimer);
      _searchNavTimer = setTimeout(recordNav, 600);
    });
    let _searchNavTimer = null;

    function updateSmartSearchActions(value) {
      const parsed = parseSaveUrl(value);
      const looksLikeQuestion = /^(?:ask|question):\s*/i.test(value) || /\?$/.test(value);
      document.querySelectorAll('[data-smart-action]').forEach(button => {
        const action = button.dataset.smartAction;
        button.classList.toggle('recommended', parsed ? action === 'save' : (looksLikeQuestion ? action === 'ask' : action === 'search'));
      });
    }

    function runSmartSearchAction(action) {
      const input = document.getElementById('searchInput');
      const value = String(input?.value || '').trim();
      if (action === 'save') {
        const parsed = parseSaveUrl(value);
        openSaveLink(parsed ? parsed.href : '');
        return;
      }
      if (action === 'ask') {
        const question = value.replace(/^(?:ask|question):\s*/i, '').trim();
        openLibraryAsk(question);
        return;
      }
      if (input) input.blur();
      if (!value) showToast('Type words to search your library.');
    }

    function resetMainSearchState() {
      const inp = document.getElementById('searchInput');
      if (inp) inp.value = '';
      searchQuery = '';
      projectQuery = '';
      clearTimeout(librarySearchTimer);
      if (librarySearch.controller) librarySearch.controller.abort();
      librarySearch.query = '';
      librarySearch.results = [];
      librarySearch.ready = false;
      librarySearch.loading = false;
      updateSearchModeButton();
      const bar = document.getElementById('searchBar');
      if (bar) bar.classList.remove('has-text');
    }

    function clearMainSearch() {
      const inp = document.getElementById('searchInput');
      resetMainSearchState();
      refresh();
      if (inp) inp.focus();
    }

    function deleteItem(id) {
      const idx = items.findIndex(i => sameId(i.id, id));
      if (idx < 0) return;
      const removed = items[idx];
      const visibleRows = [...document.querySelectorAll('#linkList .finder-link-row')];
      const currentRow = visibleRows.find(row => sameId(row.dataset.id, id));
      const neighbourId = currentRow
        ? (visibleRows[visibleRows.indexOf(currentRow) + 1]?.dataset.id || visibleRows[visibleRows.indexOf(currentRow) - 1]?.dataset.id)
        : null;
      items = items.filter(i => !sameId(i.id, id));
      dbDelete(removed.id);
      refresh();
      if (neighbourId != null) requestAnimationFrame(() => {
        document.querySelector(`#linkList .finder-link-row[data-id="${CSS.escape(String(neighbourId))}"] .finder-link-anchor`)?.focus();
      });
      showToast('Link deleted', () => {
        items.splice(Math.min(idx, items.length), 0, removed);
        dbPut(removed);
        refresh();
        flashItem(removed.id);
      });
    }

    // Pin / unpin a link — pinned links float to the top of every view.
    function togglePin(id) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      item.pinned = !item.pinned;
      dbPut(item);
      refresh();
      requestAnimationFrame(() => {
        document.querySelector(`#linkList .finder-link-row[data-id="${CSS.escape(String(id))}"] .finder-action`)?.focus();
      });
    }

    // Record that a link was opened — powers "Stale" detection (#7).
    function markOpened(id) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      item.lastOpened = Date.now();
      dbPut(item);   // no refresh — the click is navigating away in a new tab
      const query = String(searchQuery || '').trim();
      const isSearchResult = query && librarySearch.ready && librarySearch.query === query &&
        librarySearch.results.some(result => String(result.itemId == null ? result.id : result.itemId) === String(id));
      if (isSearchResult) sendSearchFeedback(id, 'relevant', { quiet: true });
    }

    // ---- Snooze (#9) ----------
    function snoozeItem(id, days) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      item.snoozedUntil = Date.now() + days * DAY_MS;
      dbPut(item);
      refresh();
      const when = days >= 7 ? `${Math.round(days / 7)} week${days >= 14 ? 's' : ''}` : `${days} day${days > 1 ? 's' : ''}`;
      showToast(`Snoozed for ${when}`, () => { const it = items.find(i => sameId(i.id, id)); if (it) { delete it.snoozedUntil; dbPut(it); refresh(); } });
    }
    function unsnoozeItem(id) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      delete item.snoozedUntil;
      dbPut(item);
      refresh();
    }
    function toggleArchive(id) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      item.archived = !item.archived;
      dbPut(item);
      refresh();
      if (item.archived) showToast('Archived', () => { const it = items.find(i => sameId(i.id, id)); if (it) { delete it.archived; dbPut(it); refresh(); } });
    }

    // ---- Quick-capture bookmarklet (#10) ------------------------------------
    let extensionCaptureShouldClose = false;
    function bookmarkletHref() {
      const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('#')[0];
      // The fragment stays in the browser and is removed immediately after capture.
      return "javascript:(function(){window.open('" + base + "#add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank');})();";
    }
    function handleAddParam() {
      let params;
      try {
        const fragment = location.hash.length > 1 ? location.hash.slice(1) : '';
        const fragmentParams = new URLSearchParams(fragment);
        params = fragmentParams.has('add') ? fragmentParams : new URLSearchParams(location.search);
      } catch (_) { return; }
      const add = params.get('add');
      if (!add) return;
      const fromExtension = params.get('source') === 'extension';
      extensionCaptureShouldClose = fromExtension && params.get('close') === '1';
      try { history.replaceState(null, '', location.pathname); } catch (_) {}
      try {
        const captureUrl = safeHttpUrl(add);
        if (!captureUrl) return;
        const parsedUrl = new URL(captureUrl);
        const norm = normalizeUrl(captureUrl);
        const existing = items.find(i => normalizeUrl(i.url) === norm);
        const selection = String(params.get('selection') || '').trim().slice(0, 5000);
        if (existing) {
          if (selection && !(existing.note || '').includes(selection)) {
            existing.note = existing.note && existing.note !== 'Click to add note...'
              ? `${existing.note}\n\nSaved selection:\n${selection}` : `Saved selection:\n${selection}`;
            dbPut(existing);
            queueItemEnrichment(existing);
          }
          flashItem(existing.id);
          showToast(selection ? 'Selection added to saved link' : 'Already saved — highlighting it');
          return;
        }
        const titleParam = params.get('title');
        const niceTitle = titleParam || prettifyTitle(parsedUrl.pathname, parsedUrl.hostname);
        const { autoTags, suggestedTags, description } = generateLinkMetadata(captureUrl, parsedUrl.hostname, parsedUrl.pathname, niceTitle);
        const project = activeFilter || chooseProject({ autoTags }, parsedUrl.hostname);
        ensureProject(project, false);
        const newItem = {
          id: newItemId(), added: Date.now(), url: captureUrl,
          title: niceTitle,
          domain: parsedUrl.hostname, description, autoTags, suggestedTags: suggestedTags || [],
          note: selection ? `Saved selection:\n${selection}` : 'Click to add note...', project,
          folderSource: activeFilter ? 'manual' : 'smart'
        };
        items.unshift(newItem);
        dbPut(newItem);
        refresh();
        flashItem(newItem.id);
        queueItemEnrichment(newItem);
        showToast(selection ? 'Selected text saved with source' : (fromExtension ? 'Saved to your library' : 'Saved from bookmarklet'));
      } catch (_) { /* ignore malformed add param */ }
    }

    // ---- Keyboard shortcuts cheat sheet -------------------------------------
    function openShortcuts() { document.getElementById('shortcutsOverlay').classList.add('show'); }
    function closeShortcuts() { document.getElementById('shortcutsOverlay').classList.remove('show'); }

    function filterProject(projectName) {
      pinnedView = false;
      recentView = false;
      const hasTransientFilters = activeTags.length > 0 || !!searchQuery;
      const openingFolder = activeFilter !== projectName || hasTransientFilters;
      activeFilter = openingFolder ? projectName : null;
      // Opening a folder is direct navigation. Do not silently carry a stale
      // tag/search intersection from the previous view into the folder.
      if (openingFolder) {
        activeTags = [];
        resetMainSearchState();
      }
      refresh();
      if (openingFolder) {
        const count = _visible.length;
        showToast(`${folderName(projectName)} · ${count} link${count === 1 ? '' : 's'}`);
      }
      recordNav();
    }

    // Finder folder names are idempotent navigation targets. Unlike the
    // legacy sidebar toggle, clicking an already open location never jumps
    // unexpectedly back to All Links.
    function navigateFolder(projectName) {
      if (!projectName || !folders[projectName]) return;
      pinnedView = false;
      recentView = false;
      const changed = activeFilter !== projectName || activeTags.length > 0 || !!searchQuery;
      activeFilter = projectName;
      activeTags = [];
      resetMainSearchState();
      refresh();
      if (changed) recordNav();
      const count = _visible.length;
      showToast(`${folderName(projectName)} · ${count} link${count === 1 ? '' : 's'}`);
    }

    function handleFinderKey(event) {
      const row = event.target.closest('.finder-row');
      if (!row) return;
      const visibleRows = [...document.querySelectorAll('#linkList .finder-row')];
      const index = visibleRows.indexOf(row);
      const focusRow = target => {
        const control = target?.querySelector('.finder-folder-button, .finder-link-anchor, .finder-disclosure');
        if (control) control.focus();
      };
      if (event.key === 'ArrowDown') { event.preventDefault(); focusRow(visibleRows[index + 1]); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); focusRow(visibleRows[index - 1]); }
      else if (event.key === 'Home') { event.preventDefault(); focusRow(visibleRows[0]); }
      else if (event.key === 'End') { event.preventDefault(); focusRow(visibleRows.at(-1)); }
      else if (row.classList.contains('finder-folder-row')) {
        const disclosure = row.querySelector('.finder-disclosure');
        if (event.key === 'ArrowRight' && disclosure?.getAttribute('aria-expanded') === 'false') {
          event.preventDefault(); disclosure.click();
        } else if (event.key === 'ArrowLeft' && disclosure?.getAttribute('aria-expanded') === 'true') {
          event.preventDefault(); disclosure.click();
        }
      }
    }

    function filterTag(tag) {
      tag = String(tag || '').trim();
      if (!tag) return;
      pinnedView = false;
      recentView = false;
      const i = activeTags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
      const selected = i < 0;
      if (!selected) activeTags.splice(i, 1);   // toggle off
      else activeTags.push(tag);                // add (multi-select, composes)
      // On phones the tags live inside the off-canvas library drawer. Closing
      // it before rendering makes the filtered result immediately visible.
      if (isMobileNav()) closeNav({ restoreFocus: false });
      refresh();
      const scroller = document.querySelector('.content-scroll');
      if (scroller) scroller.scrollTop = 0;
      showToast(selected
        ? `#${tag} · ${_visible.length} link${_visible.length === 1 ? '' : 's'}`
        : `Removed #${tag} filter`);
      recordNav();
    }
    function setTagMode(mode) {
      tagMode = (mode === 'and') ? 'and' : 'or';
      refresh();
      recordNav();
    }
    function clearTags() {
      activeTags = [];
      refresh();
      recordNav();
    }

    function showAll() {
      pinnedView = false;
      recentView = false;
      activeFilter = null;
      activeTags = [];
      searchQuery = '';
      const s = document.getElementById('searchInput');
      if (s) s.value = '';
      refresh();
      recordNav();
    }

    // "Pinned" library view — only pinned links, ignores project/tag filters.
    function showPinned() {
      pinnedView = !pinnedView;
      recentView = false;
      activeFilter = null;
      activeTags = [];
      searchQuery = '';
      const s = document.getElementById('searchInput');
      if (s) s.value = '';
      refresh();
      recordNav();
    }

    // "Recently Added" library view — the newest links, chronological.
    function showRecent() {
      recentView = !recentView;
      recentWindow = 0;
      recentShowAll = false;
      pinnedView = false;
      activeFilter = null;
      activeTags = [];
      searchQuery = '';
      const s = document.getElementById('searchInput');
      if (s) s.value = '';
      refresh();
      recordNav();
    }

    // ---- Navigation history (header back / forward) ----
    let navStack = [];
    let navPos = -1;
    let navSuspend = false;
    function navSnapshot() {
      return { f: activeFilter, t: activeTags.slice(), tm: tagMode, q: searchQuery, p: pinnedView, r: recentView, rw: recentWindow, ra: recentShowAll };
    }
    function navEqual(a, b) {
      return a && b && a.f === b.f && a.q === b.q && !!a.p === !!b.p && !!a.r === !!b.r && a.rw === b.rw && !!a.ra === !!b.ra && a.tm === b.tm &&
        (a.t || []).length === (b.t || []).length &&
        (a.t || []).every((x, i) => x === (b.t || [])[i]);
    }
    function recordNav() {
      if (navSuspend) return;
      const snap = navSnapshot();
      if (navEqual(snap, navStack[navPos])) return;
      navStack = navStack.slice(0, navPos + 1);
      navStack.push(snap);
      navPos = navStack.length - 1;
      updateNavButtons();
    }
    function applyNav(state) {
      navSuspend = true;
      activeFilter = state.f;
      activeTags = (state.t || []).slice();
      tagMode = state.tm || 'or';
      searchQuery = state.q;
      pinnedView = !!state.p;
      recentView = !!state.r;
      recentWindow = Number(state.rw) || 0;
      recentShowAll = !!state.ra;
      const s = document.getElementById('searchInput');
      if (s) s.value = state.q || '';
      refresh();
      navSuspend = false;
    }
    function navBack() {
      if (navPos <= 0) return;
      navPos--;
      applyNav(navStack[navPos]);
      updateNavButtons();
    }
    function navForward() {
      if (navPos >= navStack.length - 1) return;
      navPos++;
      applyNav(navStack[navPos]);
      updateNavButtons();
    }
    function updateNavButtons() {
      const b = document.getElementById('btnNavBack');
      const f = document.getElementById('btnNavFwd');
      if (b) b.disabled = navPos <= 0;
      if (f) f.disabled = navPos >= navStack.length - 1;
    }

    // ---- Per-card tag editing (#7, #9 learn from corrections, #12 confirm suggestions) ----
    function removeTag(id, tag) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      const had = (item.autoTags || []).includes(tag);
      item.autoTags = (item.autoTags || []).filter(t => t !== tag);
      recordTagOverride(item.domain, tag, 'remove');
      dbPut(item);
      refresh();
      if (had) showToast(`Removed #${tag}`, () => {
        const it = items.find(i => sameId(i.id, id));
        if (!it) return;
        it.autoTags = it.autoTags || [];
        if (!it.autoTags.includes(tag)) it.autoTags.push(tag);
        dbPut(it);
        refresh();
      });
    }

    async function addTagToItem(id) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      const raw = await uiPrompt({ title: 'Add a tag', message: 'Type a tag for this link.', okLabel: 'Add tag', icon: 'hash', value: '' });
      if (!raw) return;
      const tag = normalizeTag(raw.trim());
      if (!tag) return;
      item.autoTags = item.autoTags || [];
      if (!item.autoTags.some(t => t.toLowerCase() === tag.toLowerCase())) {
        item.autoTags.push(tag);
        recordTagOverride(item.domain, tag, 'add');
      }
      item.suggestedTags = (item.suggestedTags || []).filter(t => t.toLowerCase() !== tag.toLowerCase());
      dbPut(item);
      refresh();
    }

    function confirmSuggested(id, tag) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      item.suggestedTags = (item.suggestedTags || []).filter(t => t !== tag);
      item.autoTags = item.autoTags || [];
      if (!item.autoTags.some(t => t.toLowerCase() === tag.toLowerCase())) item.autoTags.push(tag);
      recordTagOverride(item.domain, tag, 'add');
      dbPut(item);
      refresh();
    }

    function dismissSuggested(id, tag) {
      const item = items.find(i => sameId(i.id, id));
      if (!item) return;
      item.suggestedTags = (item.suggestedTags || []).filter(t => t !== tag);
      recordTagOverride(item.domain, tag, 'remove');
      dbPut(item);
      refresh();
    }

    // ---- Command palette (Cmd/Ctrl + K) --------------------------------------
    let _cmdkRows = [];      // [{type, label, sub, run, icon, meta}]
    let _cmdkIdx = 0;
    function openCmdk() {
      const ov = document.getElementById('cmdkOverlay');
      ov.classList.add('show');
      const inp = document.getElementById('cmdkInput');
      inp.value = '';
      renderCmdk('');
      setTimeout(() => inp.focus(), 20);
    }
    function closeCmdk() { document.getElementById('cmdkOverlay').classList.remove('show'); }

    function cmdkCommands() {
      return [
        { type: 'cmd', label: 'Show all links', sub: 'Clear every filter', icon: ICONS.folder, run: () => { showAll(); } },
        { type: 'cmd', label: 'Pinned Links', sub: 'Only pinned links', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3v2h-5v5l-1 1-1-1v-5H4v-2l3-3z"/></svg>', run: () => { pinnedView = false; showPinned(); } },
        { type: 'cmd', label: 'Recently Added', sub: 'Newest links first', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>', run: () => { recentView = false; showRecent(); } },
        { type: 'cmd', label: 'New folder', sub: 'Create a folder', icon: ICONS.folderPlus, run: () => { addNewProject(); } },
        { type: 'cmd', label: 'Lines view', sub: 'Compact list', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>', run: () => { setView('lines'); } },
        { type: 'cmd', label: 'Pinterest view', sub: 'Grid masonry', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>', run: () => { setView('pinterest'); } },
        { type: 'cmd', label: 'Import / export', sub: 'Bookmarks & backup', icon: ICONS.edit, run: () => { openSettings('data'); } },
        { type: 'cmd', label: 'Check links', sub: 'Duplicates & broken', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>', run: () => { openHealth(); } },
        { type: 'cmd', label: 'Auto-organize', sub: 'Bulk file into folders', icon: ICONS.folder, run: () => { openOrganize(); } },
        { type: 'cmd', label: 'Keyboard shortcuts', sub: 'View all hotkeys', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg>', run: () => { openShortcuts(); } },
      ];
    }

    function renderCmdk(query) {
      const q = (query || '').trim().toLowerCase();
      const listEl = document.getElementById('cmdkList');
      const all = allKnownProjects();
      const counts = folderDirectCounts();
      const tagCounts = {};
      items.forEach(i => (i.autoTags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

      const groups = [];

      // Commands
      const cmds = cmdkCommands().filter(c => !q || c.label.toLowerCase().includes(q) || (c.sub || '').toLowerCase().includes(q));
      if (cmds.length) groups.push({ label: 'Actions', rows: cmds });

      // Folders
      const folderRows = all.filter(p => !q || folderName(p).toLowerCase().includes(q))
        .sort((a, b) => (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || folderName(a).localeCompare(folderName(b)))
        .slice(0, q ? 8 : 6)
        .map(p => ({ type: 'folder', label: folderName(p), sub: 'Folder', icon: projectIconHtml(p), color: projectColor(p), meta: String(rollupCount(p, counts, all)), run: () => { filterProject(p); } }));
      if (folderRows.length) groups.push({ label: 'Folders', rows: folderRows });

      // Tags
      const tags = Object.keys(tagCounts).filter(t => !q || t.toLowerCase().includes(q))
        .sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b))
        .slice(0, q ? 8 : 5)
        .map(t => ({ type: 'tag', label: '#' + t, sub: 'Tag', icon: ICONS.hash, meta: String(tagCounts[t]), run: () => { activeTags = []; filterTag(t); } }));
      if (tags.length) groups.push({ label: 'Tags', rows: tags });

      // Links (only when searching)
      if (q) {
        const links = items.filter(i =>
          (i.title || '').toLowerCase().includes(q) || (i.domain || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
        ).slice(0, 8).map(i => ({
          type: 'link', label: i.title, sub: i.domain,
          icon: faviconHtml(i.domain, { style: 'width:18px;height:18px;border-radius:4px' }),
          run: () => { openSafeHttpUrl(i.url); }
        }));
        if (links.length) groups.push({ label: 'Links', rows: links });
      } else {
        // No query → surface the most recently saved links as a jumping-off point.
        const recents = items.slice().sort(cmpNewestFirst)
          .slice(0, 5).map(i => ({
            type: 'link', label: i.title, sub: i.domain,
            icon: faviconHtml(i.domain, { style: 'width:18px;height:18px;border-radius:4px' }),
            run: () => { openSafeHttpUrl(i.url); }
          }));
        if (recents.length) groups.push({ label: 'Recent', rows: recents });
      }

      _cmdkRows = [];
      groups.forEach(g => g.rows.forEach(r => _cmdkRows.push(r)));
      _cmdkIdx = 0;

      if (!_cmdkRows.length) { listEl.innerHTML = '<div class="cmdk-empty">No matches</div>'; return; }

      let html = '', flat = 0;
      groups.forEach(g => {
        html += `<div class="cmdk-group-label">${g.label}</div>`;
        g.rows.forEach(r => {
          const idx = flat++;
          const icStyle = r.color ? ` style="--folder-accent:${r.color}"` : '';
          html += `<div class="cmdk-row${idx === 0 ? ' active' : ''}" data-idx="${idx}" onmousemove="cmdkHover(${idx})" onclick="cmdkRun(${idx})">
            <span class="cmdk-ic${r.color ? ' has-folder-accent' : ''}"${icStyle}>${r.icon}</span>
            <span class="cmdk-txt"><span class="cmdk-title">${htmlAttr(r.label)}</span>${r.sub ? `<span class="cmdk-sub">${htmlAttr(r.sub)}</span>` : ''}</span>
            ${r.meta ? `<span class="cmdk-meta">${r.meta}</span>` : ''}
          </div>`;
        });
      });
      listEl.innerHTML = html;
    }

    function cmdkHover(i) { _cmdkIdx = i; cmdkHighlight(); }
    function cmdkHighlight() {
      document.querySelectorAll('#cmdkList .cmdk-row').forEach(el => {
        const on = parseInt(el.dataset.idx, 10) === _cmdkIdx;
        el.classList.toggle('active', on);
        if (on) el.scrollIntoView({ block: 'nearest' });
      });
    }
    function cmdkRun(i) {
      const row = _cmdkRows[i];
      if (!row) return;
      closeCmdk();
      row.run();
    }
    function cmdkKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); _cmdkIdx = Math.min(_cmdkIdx + 1, _cmdkRows.length - 1); cmdkHighlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); _cmdkIdx = Math.max(_cmdkIdx - 1, 0); cmdkHighlight(); }
      else if (e.key === 'Enter') { e.preventDefault(); cmdkRun(_cmdkIdx); }
    }

    // ---- Keyboard shortcuts (#8) ----
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCmdk();
        return;
      }
      if (e.key === 'Escape') {
        const lov = document.getElementById('libraryAskOverlay');
        if (lov && lov.classList.contains('show')) { closeLibraryAsk(); return; }
        const sc = document.getElementById('shortcutsOverlay');
        if (sc && sc.classList.contains('show')) { closeShortcuts(); return; }
        const ck = document.getElementById('cmdkOverlay');
        if (ck && ck.classList.contains('show')) { closeCmdk(); return; }
        const aov = document.getElementById('askOverlay');
        if (aov && aov.classList.contains('show')) { askCancel(); return; }
        const hov = document.getElementById('healthOverlay');
        if (hov && hov.classList.contains('show')) { closeHealth(); return; }
        const tov = document.getElementById('tagsOverlay');
        if (tov && tov.classList.contains('show')) { closeTagsModal(); return; }
        const fov = document.getElementById('folderCustomOverlay');
        if (fov && fov.classList.contains('show')) { closeFolderCustomize(); return; }
        const ov = document.getElementById('settingsOverlay');
        if (ov && ov.classList.contains('show')) { closeSettings(); return; }
        if (activeFilter || activeTags.length || searchQuery) { showAll(); return; }
        if (typing) e.target.blur();
        return;
      }
      if (typing) return;
      if (e.key === '/') {
        e.preventDefault();
        const s = document.getElementById('searchInput');
        if (s) s.focus();
        return;
      }
      if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        const si = document.getElementById('searchInput'); if (si) si.focus();
        return;
      }
      if (e.key === '1') { e.preventDefault(); setView('lines'); return; }
      if (e.key === '2') { e.preventDefault(); setView('pinterest'); return; }
    });

    // ---- Settings: import / export bookmarks ----------------------------------
    const SETTINGS_CATEGORIES = ['intelligence', 'data', 'capture', 'health', 'privacy'];
    function openSettings(category = '') {
      closeHeaderMenu();
      closeNav();
      document.getElementById('importStatus').textContent = '';
      setImportWorkflowStep(0);
      const bm = document.getElementById('bookmarkletLink');
      if (bm) bm.setAttribute('href', bookmarkletHref());
      syncPrivacyToggle();
      updateLibraryIntelStatus();
      const requestedCategory = SETTINGS_CATEGORIES.includes(category) ? category : '';
      setSettingsCategory(requestedCategory || 'intelligence', { openCategory: !!requestedCategory });
      document.querySelector('.settings-modal')?.classList.toggle('settings-category-open', !!requestedCategory);
      document.getElementById('settingsOverlay').classList.add('show');
      document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'true');
      document.getElementById('mobileSettingsTab')?.setAttribute('aria-expanded', 'true');
      setTimeout(() => {
        const mobileDetail = requestedCategory && window.matchMedia('(max-width: 700px)').matches;
        (mobileDetail
          ? document.querySelector('.settings-mobile-back')
          : document.querySelector('.settings-tab.active'))?.focus();
      }, 40);
    }
    function openHeaderAccountAction() {
      closeHeaderMenu();
      const compact = window.matchMedia?.('(max-width: 820px)').matches;
      const button = document.getElementById('btnMenu');
      if (compact && !cloud.user) {
        button?.setAttribute('aria-controls', 'loginOverlay');
        button?.setAttribute('aria-expanded', 'true');
        openLogin();
      } else {
        openSettings();
      }
    }
    function closeSettings() {
      document.getElementById('settingsOverlay').classList.remove('show');
      document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'false');
      document.getElementById('mobileSettingsTab')?.setAttribute('aria-expanded', 'false');
    }

    function setSettingsCategory(category, options = {}) {
      if (!SETTINGS_CATEGORIES.includes(category)) category = 'intelligence';
      document.querySelectorAll('[data-settings-tab]').forEach(tab => {
        const active = tab.dataset.settingsTab === category;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
        tab.tabIndex = active ? 0 : -1;
        if (active) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      document.querySelectorAll('[data-settings-panel]').forEach(panel => {
        const active = panel.dataset.settingsPanel === category;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
      if (options.openCategory !== false) document.querySelector('.settings-modal')?.classList.add('settings-category-open');
    }
    function showSettingsDirectory() {
      document.querySelector('.settings-modal')?.classList.remove('settings-category-open');
      setTimeout(() => document.querySelector('.settings-tab.active')?.focus(), 0);
    }
    function onSettingsTabKey(event) {
      const tabs = [...event.currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
      const index = tabs.indexOf(event.currentTarget);
      let next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      const tab = tabs[next];
      const mobileDirectory = window.matchMedia('(max-width: 700px)').matches &&
        !document.querySelector('.settings-modal')?.classList.contains('settings-category-open');
      setSettingsCategory(tab.dataset.settingsTab, { openCategory: !mobileDirectory });
      tab.focus();
    }

    // ---- Reusable prompt / confirm dialog (Promise-based) ---------------------
    let _askResolve = null;
    const ASK_ICONS = {
      edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
      folderPlus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
      trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
    };
    function uiPrompt(opts) {
      // opts: { title, message, value, okLabel, icon }
      return new Promise(resolve => {
        _askResolve = resolve;
        const modal = document.querySelector('#askOverlay .ask-modal');
        modal.classList.remove('danger');
        document.getElementById('askIcon').innerHTML = ASK_ICONS[opts.icon || 'edit'] || ASK_ICONS.edit;
        document.getElementById('askTitle').textContent = opts.title || '';
        document.getElementById('askMsg').textContent = opts.message || '';
        const input = document.getElementById('askInput');
        input.classList.remove('hidden');
        input.value = opts.value || '';
        document.getElementById('askOkBtn').textContent = opts.okLabel || 'OK';
        document.getElementById('askCancelBtn').style.display = '';
        document.getElementById('askOverlay').classList.add('show');
        setTimeout(() => { input.focus(); input.select(); }, 30);
      });
    }
    function uiConfirm(opts) {
      // opts: { title, message, okLabel, danger }
      return new Promise(resolve => {
        _askResolve = resolve;
        const modal = document.querySelector('#askOverlay .ask-modal');
        modal.classList.toggle('danger', !!opts.danger);
        document.getElementById('askIcon').innerHTML = ASK_ICONS[opts.icon || (opts.danger ? 'trash' : 'edit')];
        document.getElementById('askTitle').textContent = opts.title || '';
        document.getElementById('askMsg').textContent = opts.message || '';
        const input = document.getElementById('askInput');
        input.classList.add('hidden');
        document.getElementById('askOkBtn').textContent = opts.okLabel || 'OK';
        document.getElementById('askCancelBtn').style.display = '';
        document.getElementById('askOverlay').classList.add('show');
        setTimeout(() => document.getElementById('askOkBtn').focus(), 30);
      });
    }
    function askOk() {
      const input = document.getElementById('askInput');
      const val = input.classList.contains('hidden') ? true : input.value;
      document.getElementById('askOverlay').classList.remove('show');
      const r = _askResolve; _askResolve = null;
      if (r) r(val);
    }
    function askCancel() {
      document.getElementById('askOverlay').classList.remove('show');
      const r = _askResolve; _askResolve = null;
      if (r) r(null);
    }

    // ---- Link health: duplicates / invalid / (best-effort) broken -------------
    let healthResults = [];  // [{id, url, title, project, issue}]
    const healthTask = {
      running: false,
      hasRun: false,
      runId: 0,
      serverJobId: null,
      done: 0,
      total: 0,
      unknown: 0,
      message: '',
      liveNote: ''
    };
    let healthPollTimer = null;
    let healthStaticFlags = new Map();
    // Reasons found before a server job starts (for example, an intranet URL).
    // Keep these separate from the issue type so a later duplicate scan cannot
    // erase the explanation the user needs to act on it safely.
    let healthStaticReasons = new Map();
    let healthServerResults = [];

    function updateHealthTaskUI() {
      const status = document.getElementById('healthStatus');
      const listEl = document.getElementById('healthList');
      const foot = document.getElementById('healthFoot');
      const btn = document.getElementById('healthScanBtn');
      const progress = document.getElementById('healthProgress');
      const backgroundNote = document.getElementById('healthBackgroundNote');
      if (!status || !listEl || !foot || !btn || !progress || !backgroundNote) return;

      status.textContent = healthTask.message;
      status.setAttribute('aria-busy', healthTask.running ? 'true' : 'false');
      btn.disabled = healthTask.running;
      btn.textContent = healthTask.running ? 'Scanning in background…' : (healthTask.hasRun ? 'Scan again' : 'Scan all links');
      backgroundNote.hidden = !healthTask.running;
      progress.hidden = !healthTask.running || healthTask.total <= 0;
      progress.max = Math.max(healthTask.total, 1);
      progress.value = Math.min(healthTask.done, healthTask.total);
      renderHealthList();
      foot.style.display = healthResults.length ? 'flex' : 'none';
    }

    function setHealthTaskMessage(message) {
      healthTask.message = message;
      updateHealthTaskUI();
    }

    function openHealth() {
      const sa = document.getElementById('healthSelAll'); if (sa) sa.checked = false;
      updateHealthTaskUI();
      document.getElementById('healthOverlay').classList.add('show');
    }
    function closeHealth() {
      document.getElementById('healthOverlay').classList.remove('show');
      if (healthTask.running) {
        const progress = healthTask.total ? ` · ${healthTask.done}/${healthTask.total}` : '';
        showToast(`Link scan continues securely on the server${progress}`);
      }
    }

    function localHealthScope(value) {
      let parsed;
      try { parsed = new URL(String(value || '').trim()); }
      catch (_) { return { issue: 'invalid', reason: 'This is not a valid HTTP or HTTPS address.' }; }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
        return { issue: 'invalid', reason: 'This is not a valid HTTP or HTTPS address.' };
      }

      // Match the Worker’s public-network safety boundary before starting a
      // background job. A bookmarked intranet, router, NAS, or private IP is
      // not “healthy” just because a public Worker cannot reach it.
      const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const ipv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
      const privateName = !host ||
        (!host.includes('.') && !host.includes(':') && !ipv4) ||
        host === 'localhost' || host.endsWith('.localhost') ||
        host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.home.arpa');
      if (privateName) {
        return {
          issue: 'not_public',
          reason: 'This is an internal or private-network address. It can only be checked from the network where it normally opens.'
        };
      }

      if (host.includes(':')) {
        const privateIpv6 = host === '::1' || host.startsWith('fc') || host.startsWith('fd') ||
          host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb') ||
          /^::ffff:(?:127|10|192\.168)\./.test(host);
        if (privateIpv6) {
          return {
            issue: 'not_public',
            reason: 'This is a private network address. It can only be checked from the network where it normally opens.'
          };
        }
        return null;
      }

      if (ipv4) {
        const octets = host.split('.').map(Number);
        const [a, b] = octets;
        const invalidIp = octets.some(n => !Number.isInteger(n) || n < 0 || n > 255);
        const privateIp = invalidIp || a === 0 || a === 10 || a === 127 ||
          (a === 100 && b >= 64 && b <= 127) ||
          (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && (b === 0 || b === 168)) ||
          (a === 198 && (b === 18 || b === 19)) || a >= 224;
        if (privateIp) {
          return {
            issue: 'not_public',
            reason: 'This is a private or reserved network address. It can only be checked from the network where it normally opens.'
          };
        }
      }
      return null;
    }

    async function runHealthCheck() {
      if (healthTask.running) return;
      try {
        await runHealthCheckTask();
      } catch (error) {
        console.error('Link health scan failed', error);
        healthTask.running = false;
        healthTask.liveNote = '';
        setHealthTaskMessage('The link scan stopped unexpectedly. Please try again.');
        if (!document.getElementById('healthOverlay').classList.contains('show')) {
          showToast('Link scan stopped · open Library health to retry');
        }
      }
    }

    async function runHealthCheckTask() {
      const doReach = document.getElementById('healthReach').checked;
      const scanItems = [...items];
      const localOnly = !doReach || !cloud.mode;
      healthResults = [];
      healthServerResults = [];
      healthStaticFlags = new Map();
      healthStaticReasons = new Map();
      healthTask.running = true;
      healthTask.hasRun = true;
      healthTask.runId += 1;
      healthTask.serverJobId = null;
      healthTask.done = 0;
      healthTask.total = localOnly ? scanItems.length : 0;
      healthTask.unknown = 0;
      healthTask.liveNote = '';
      const runId = healthTask.runId;
      setHealthTaskMessage('Scanning…');
      let liveNote = '';

      await collectHealthStaticFlags(scanItems);
      if (localOnly) {
        healthTask.done = healthTask.total;
        updateHealthTaskUI();
      }

      // Reliable reachability runs in the Worker: browser no-cors probes cannot
      // distinguish CORS, mixed-content blocking, DNS failures and real 404s.
      if (doReach) {
        if (!cloud.mode) {
          liveNote = ' Sign in to add a reliable live-page check.';
        } else {
          setHealthTaskMessage('Preparing secure server scan…');
          await cloudPushNow({ throwOnError: true });
          const response = await fetch('/api/library/health-job', {
            method: 'POST', headers: { Accept: 'application/json' }
          });
          const data = await response.json().catch(() => null);
          if (!response.ok || !data || !data.job) {
            throw new Error(data && data.error === 'background_queue_unavailable'
              ? 'Background scan is not configured yet.'
              : `Background scan could not start (${response.status}).`);
          }
          if (runId !== healthTask.runId) return;
          applyServerHealthJob(data.job);
          scheduleHealthJobPoll(900);
          return;
        }
      }

      rebuildHealthResults();
      healthTask.running = false;
      healthTask.liveNote = liveNote;
      const n = healthResults.length;
      setHealthTaskMessage((n ? `${n} link${n > 1 ? 's' : ''} flagged.` : 'No local problems found.') + liveNote);
      if (!document.getElementById('healthOverlay').classList.contains('show')) {
        showToast(n ? `Link scan finished · ${n} issue${n === 1 ? '' : 's'} found` : 'Link scan finished · no problems found');
      }
    }

    async function collectHealthStaticFlags(scanItems = [...items]) {
      healthStaticFlags = new Map();
      healthStaticReasons = new Map();
      analyzeLocalLinkHealth(scanItems).forEach(result => healthStaticFlags.set(String(result.id), result.issue));
      scanItems.forEach(item => {
        const id = String(item && item.id);
        const scope = localHealthScope(item && item.url);
        if (!scope || scope.issue !== 'not_public') return;
        // A visibility problem is more important than a duplicate label: it
        // tells the user why this page was not tested by the public service.
        healthStaticFlags.set(id, scope.issue);
        healthStaticReasons.set(id, scope.reason);
      });
      if (cloud.mode) {
        try {
          setHealthTaskMessage('Comparing page content…');
          const response = await fetch('/api/library/duplicates', { headers: { Accept: 'application/json' } });
          if (response.ok) {
            const data = await response.json();
            for (const group of (data.groups || [])) {
              const members = Array.isArray(group.itemIds) ? group.itemIds : [];
              members.slice(1).forEach(memberId => {
                const id = String(memberId);
                if (scanItems.some(item => sameId(item.id, id)) && !healthStaticFlags.has(id)) {
                  healthStaticFlags.set(id, group.type === 'content' ? 'same_content' : 'duplicate');
                }
              });
            }
          }
        } catch (error) { console.warn('Content duplicate check unavailable', error); }
      }
      rebuildHealthResults();
    }

    function rebuildHealthResults() {
      const flagged = new Map(healthStaticFlags);
      for (const result of healthServerResults) {
        const id = String(result.id);
        // A confirmed 404/410 is more actionable than a duplicate label. Keep
        // one clear status per row and make the guarded bulk-removal control
        // available even when the same URL also belongs to a duplicate group.
        if (result.status === 'broken') flagged.set(id, 'broken');
        else if (result.status === 'invalid') flagged.set(id, 'invalid');
        // Unreachable/private/network-blocked links still matter to the user.
        // Show them for manual review, but never include them in the guarded
        // "Remove all broken" action, which remains 404/410-only.
        else if (result.status === 'unknown' && !flagged.has(id)) flagged.set(id, 'unreachable');
      }
      healthResults = items.filter(item => flagged.has(String(item.id)))
        .map(item => {
          const serverResult = healthServerResults.find(result => sameId(result.id, item.id));
          return {
          id: item.id, url: item.url, title: item.title || item.url,
          project: item.project, issue: flagged.get(String(item.id)),
          httpStatus: serverResult?.httpStatus ?? null,
          reason: healthStaticReasons.get(String(item.id)) || serverResult?.reason || ''
          };
        });
      updateHealthTaskUI();
    }

    function applyServerHealthJob(job, { notify = true } = {}) {
      if (!job || !job.id) return;
      healthTask.serverJobId = String(job.id);
      healthTask.hasRun = true;
      healthTask.total = Math.max(0, Number(job.total) || 0);
      healthTask.done = Math.max(0, Number(job.processed) || 0);
      healthTask.unknown = Math.max(0, Number(job.unknown) || 0);
      healthServerResults = Array.isArray(job.results) ? job.results : [];
      const active = job.status === 'queued' || job.status === 'running';
      healthTask.running = active;
      healthTask.liveNote = healthTask.unknown
        ? ` ${healthTask.unknown} live check${healthTask.unknown === 1 ? ' could' : 's could'} not be verified and ${healthTask.unknown === 1 ? 'is' : 'are'} shown for review.`
        : '';
      rebuildHealthResults();
      if (active) {
        setHealthTaskMessage(`Checking securely on the server… ${healthTask.done}/${healthTask.total}${healthTask.unknown ? ` · ${healthTask.unknown} inconclusive` : ''}`);
      } else if (job.status === 'completed') {
        const n = healthResults.length;
        setHealthTaskMessage((n ? `${n} link${n === 1 ? '' : 's'} flagged.` : 'No problems found.') + healthTask.liveNote);
        if (notify && !document.getElementById('healthOverlay').classList.contains('show')) {
          showToast(n ? `Link scan finished · ${n} issue${n === 1 ? '' : 's'} found` : 'Link scan finished · no problems found');
        }
      } else if (job.status === 'failed') {
        setHealthTaskMessage('The server scan stopped safely. Start it again when ready.');
      }
    }

    function scheduleHealthJobPoll(delay = 1600) {
      if (!healthTask.serverJobId || !healthTask.running) return;
      if (healthPollTimer) clearTimeout(healthPollTimer);
      healthPollTimer = setTimeout(pollHealthJob, delay);
    }

    async function pollHealthJob() {
      healthPollTimer = null;
      const id = healthTask.serverJobId;
      if (!id || !cloud.mode) return;
      try {
        const response = await fetch('/api/library/health-job?id=' + encodeURIComponent(id), {
          headers: { Accept: 'application/json' }
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !data.job) throw new Error(`Health job status unavailable (${response.status})`);
        if (id !== healthTask.serverJobId) return;
        applyServerHealthJob(data.job);
        scheduleHealthJobPoll();
      } catch (error) {
        console.warn('Background link scan status unavailable', error);
        healthTask.running = true;
        setHealthTaskMessage('Scan continues on the server. Reconnecting…');
        scheduleHealthJobPoll(5_000);
      }
    }

    async function resumeHealthJob(silent = false) {
      if (!cloud.mode || healthTask.running) return;
      try {
        const response = await fetch('/api/library/health-job', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data || !data.job) return;
        await collectHealthStaticFlags([...items]);
        applyServerHealthJob(data.job, { notify: false });
        scheduleHealthJobPoll(500);
      } catch (error) {
        if (!silent) console.warn('Saved link scan could not be restored', error);
      }
    }

    function renderHealthList() {
      const listEl = document.getElementById('healthList');
      listEl.innerHTML = '';
      const labels = {
        duplicate: 'Duplicate', same_content: 'Same content', invalid: 'Invalid URL',
        broken: 'Broken page', unreachable: 'Couldn’t verify',
        not_public: 'Not publicly checkable'
      };
      healthResults.forEach(r => {
        const row = document.createElement('label');
        row.className = 'health-row';
        row.innerHTML = `
          <input type="checkbox" class="health-cb" data-id="${htmlAttr(String(r.id))}" />
          <span class="health-badge health-${r.issue}">${labels[r.issue]}</span>
          <span class="health-info">
            <span class="health-title">${htmlAttr(r.title)}</span>
            <span class="health-url">${htmlAttr(r.url)}</span>
            ${r.issue === 'unreachable' || r.issue === 'not_public' ? `<span class="health-reason">${htmlAttr(r.reason || 'The page could not be reached from the public internet. Check it from the network where it normally opens.')}</span>` : ''}
          </span>`;
        listEl.appendChild(row);
      });
      const removeBroken = document.getElementById('healthRemoveBrokenBtn');
      if (removeBroken) {
        const brokenCount = healthResults.filter(result => result.issue === 'broken' && [404, 410].includes(Number(result.httpStatus))).length;
        removeBroken.hidden = brokenCount === 0;
        removeBroken.textContent = `Remove all broken${brokenCount ? ` (${brokenCount})` : ''}`;
      }
    }

    function toggleHealthSelectAll(checked) {
      document.querySelectorAll('#healthList .health-cb').forEach(cb => { cb.checked = checked; });
    }

    async function removeHealthSelected() {
      const selected = [...document.querySelectorAll('#healthList .health-cb')]
        .filter(cb => cb.checked).map(cb => cb.dataset.id);
      if (!selected.length) return;
      const confirmed = await uiConfirm({
        title: `Remove ${selected.length} selected link${selected.length === 1 ? '' : 's'}?`,
        message: 'The selected links will be permanently removed from this library. This cannot be undone.',
        okLabel: 'Remove selected links',
        danger: true,
        icon: 'trash'
      });
      if (!confirmed) return;
      const ids = items.filter(item => selected.some(id => sameId(item.id, id))).map(item => item.id);
      items = items.filter(item => !selected.some(id => sameId(item.id, id)));
      dbDeleteMany(ids);
      healthResults = healthResults.filter(result => !selected.some(id => sameId(result.id, id)));
      renderHealthList();
      const foot = document.getElementById('healthFoot');
      if (!healthResults.length) foot.style.display = 'none';
      setHealthTaskMessage(`Removed ${ids.length} link${ids.length > 1 ? 's' : ''}.`);
      const sa = document.getElementById('healthSelAll'); if (sa) sa.checked = false;
      refresh();
    }

    async function removeAllBrokenHealth() {
      // Only links confirmed by the live scan as HTTP 404 or 410 can enter
      // this deletion path. No uncertain response, timeout, internal URL, or
      // bot-blocked page can be removed in one click.
      const broken = healthResults.filter(result => result.issue === 'broken' && [404, 410].includes(Number(result.httpStatus)));
      if (!broken.length) return;
      const confirmed = await uiConfirm({
        title: `Remove ${broken.length} broken link${broken.length === 1 ? '' : 's'}?`,
        message: 'Only links confirmed by the live scan as HTTP 404 or 410 will be removed. This cannot be undone.',
        okLabel: 'Remove broken links',
        danger: true,
        icon: 'trash'
      });
      if (!confirmed) return;
      const selected = broken.map(result => String(result.id));
      const ids = items.filter(item => selected.some(id => sameId(item.id, id))).map(item => item.id);
      items = items.filter(item => !selected.some(id => sameId(item.id, id)));
      dbDeleteMany(ids);
      // Keep every non-removable result (for example an unknown server
      // response) visible after a 404/410 cleanup. Only the records actually
      // deleted above leave the current review list.
      healthResults = healthResults.filter(result => !selected.some(id => sameId(result.id, id)));
      renderHealthList();
      const foot = document.getElementById('healthFoot');
      if (!healthResults.length) foot.style.display = 'none';
      setHealthTaskMessage(`Removed ${ids.length} confirmed broken link${ids.length === 1 ? '' : 's'}.`);
      const selectAll = document.getElementById('healthSelAll');
      if (selectAll) selectAll.checked = false;
      refresh();
    }

    // Gentler than delete — archive flagged links so they leave the main view but
    // stay recoverable in the Archived smart view.
    function archiveHealthSelected() {
      const selected = [...document.querySelectorAll('#healthList .health-cb')]
        .filter(cb => cb.checked).map(cb => cb.dataset.id);
      if (!selected.length) return;
      const changed = [];
      items.forEach(item => { if (selected.some(id => sameId(item.id, id)) && !item.archived) { item.archived = true; changed.push(item); } });
      dbPutMany(changed);
      healthResults = healthResults.filter(result => !selected.some(id => sameId(result.id, id)));
      renderHealthList();
      const foot = document.getElementById('healthFoot');
      if (!healthResults.length) foot.style.display = 'none';
      setHealthTaskMessage(`Archived ${selected.length} link${selected.length > 1 ? 's' : ''}.`);
      const sa = document.getElementById('healthSelAll'); if (sa) sa.checked = false;
      refresh();
    }

    // ---- Auto-organize (bulk auto-file) (#2) --------------------------------
    let organizeResults = [];
    function computeOrganizeSuggestions() {
      const out = [];
      for (const it of items) {
        if (it.archived) continue;
        if (priorityProjects.has(it.project)) continue;   // never touch manual folders
        const target = inferProjectName(it.autoTags, it.domain);
        if (target && target !== it.project) out.push({ id: it.id, title: it.title || it.url, from: it.project, to: target });
      }
      return out;
    }
    function openOrganize() {
      organizeResults = computeOrganizeSuggestions();
      const status = document.getElementById('organizeStatus');
      const foot = document.getElementById('organizeFoot');
      renderOrganizeList();
      if (organizeResults.length) {
        status.textContent = `${organizeResults.length} link${organizeResults.length > 1 ? 's' : ''} could move to a better-matching folder.`;
        foot.style.display = 'flex';
        const sa = document.getElementById('organizeSelAll'); if (sa) sa.checked = true;
      } else {
        status.textContent = 'Everything looks well-filed — no suggestions.';
        foot.style.display = 'none';
      }
      document.getElementById('organizeOverlay').classList.add('show');
    }
    function closeOrganize() {
      document.getElementById('organizeOverlay').classList.remove('show');
    }
    function renderOrganizeList() {
      const listEl = document.getElementById('organizeList');
      listEl.innerHTML = '';
      organizeResults.forEach(r => {
        const row = document.createElement('label');
        row.className = 'health-row';
        row.innerHTML = `
          <input type="checkbox" class="organize-cb" data-id="${htmlAttr(r.id)}" checked />
          <span class="health-info">
            <span class="health-title">${htmlAttr(r.title)}</span>
            <span class="organize-move"><span class="organize-from">${htmlAttr(r.from)}</span><span class="organize-arrow">→</span><span class="organize-to">${htmlAttr(r.to)}</span></span>
          </span>`;
        listEl.appendChild(row);
      });
    }
    function toggleOrganizeSelectAll(checked) {
      document.querySelectorAll('#organizeList .organize-cb').forEach(cb => { cb.checked = checked; });
    }
    function applyOrganize() {
      const picked = [...document.querySelectorAll('#organizeList .organize-cb')]
        .filter(cb => cb.checked).map(cb => parseInt(cb.dataset.id, 10));
      if (!picked.length) return;
      const pset = new Set(picked);
      const byId = new Map(organizeResults.map(r => [r.id, r.to]));
      const changed = [];
      items.forEach(i => {
        if (pset.has(i.id)) {
          const target = byId.get(i.id);
          if (target) { const targetId = ensureProject(target, false, { kind: 'smart' }); if (targetId !== i.project) { i.project = targetId; i.folderId = targetId; i.projectName = folderName(targetId); changed.push(i); } }
        }
      });
      dbPutMany(changed);
      closeOrganize();
      refresh();
      showToast(`Moved ${changed.length} link${changed.length > 1 ? 's' : ''}`);
    }

    function downloadFile(filename, text, mime) {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function exportJSON() {
      const data = JSON.stringify({
        format: 'saveto.me-backup',
        version: FOLDER_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        folders: Object.values(folders),
        projects: customProjects,
        priorityProjects: [...priorityProjects],
        projectParent,
        tagOrder,
        items
      }, null, 2);
      downloadFile('saveto.me-backup.json', data, 'application/json');
    }

    // Netscape Bookmark File — the format every browser imports. Sub-folders nest
    // as <DL> inside their parent, so the folder hierarchy round-trips.
    function exportHTML() {
      const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const all = allKnownProjects();
      const byProject = new Map();
      for (const i of items) {
        const folderId = itemFolderId(i);
        const project = folderId && folders[folderId] ? folderId : null;
        if (!byProject.has(project)) byProject.set(project, []);
        byProject.get(project).push(i);
      }
      const parentOf = p => (projectParent[p] && all.includes(projectParent[p])) ? projectParent[p] : null;
      const roots = all.filter(p => !parentOf(p)).sort((a, b) => a.localeCompare(b));
      const kidsOf = p => all.filter(c => parentOf(c) === p).sort((a, b) => a.localeCompare(b));

      function emit(proj, depth) {
        const pad = '    '.repeat(depth + 1);
        let s = `${pad}<DT><H3>${esc(folderName(proj))}</H3>\n${pad}<DL><p>\n`;
        for (const i of (byProject.get(proj) || [])) {
          const tags = (i.autoTags || []).join(',');
          s += `${pad}    <DT><A HREF="${esc(i.url)}"${tags ? ` TAGS="${esc(tags)}"` : ''}>${esc(i.title || i.domain)}</A>\n`;
        }
        for (const c of kidsOf(proj)) s += emit(c, depth + 1);
        s += `${pad}</DL><p>\n`;
        return s;
      }
      const unfiled = (byProject.get(null) || []).map(i => {
        const tags = (i.autoTags || []).join(',');
        return `    <DT><A HREF="${esc(i.url)}"${tags ? ` TAGS="${esc(tags)}"` : ''}>${esc(i.title || i.domain)}</A>\n`;
      }).join('');
      const body = unfiled + roots.map(r => emit(r, 0)).join('');
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}</DL><p>\n`;
      downloadFile('saveto.me-bookmarks.html', html, 'text/html');
    }

    function setImportWorkflowStep(step = 0) {
      const steps = [...document.querySelectorAll('.settings-import-flow li')];
      if (!steps.length) return;
      const current = Math.max(0, Math.min(Number(step) || 0, steps.length - 1));
      steps.forEach((item, index) => {
        item.classList.toggle('current', index === current);
        item.classList.toggle('completed', index < current);
        if (index === current) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
    }

    function handleImportFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      setImportWorkflowStep(1);
      if (file.size > 50 * 1024 * 1024) {
        document.getElementById('importStatus').textContent = 'Import failed: the file is larger than the 50 MB safety limit.';
        setImportWorkflowStep(0);
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const status = document.getElementById('importStatus');
        try {
          const text = String(reader.result);
          const preview = previewImport(text, file.name);
          setImportWorkflowStep(2);
          const backupRestore = preview.kind === 'json';
          const actionable = preview.links + (preview.merged || 0);
          if (actionable === 0) {
            status.textContent = preview.totalLinks
              ? (backupRestore ? 'No valid bookmarks were found in this backup.' : `No new links found (${preview.totalLinks} already imported or duplicated).`)
              : 'No new links found (the file is empty).';
            setImportWorkflowStep(0);
            e.target.value = '';
            return;
          }
          const confirmed = await uiConfirm(backupRestore ? {
            title: `Restore ${preview.links} new and merge ${preview.merged} existing bookmark${actionable === 1 ? '' : 's'}?`,
            message: `${preview.totalLinks} found · ${preview.folders} folder${preview.folders === 1 ? '' : 's'}. Existing bookmark IDs stay unchanged. Pinned status and tags are combined, notes are preserved, and an active link stays active.`,
            okLabel: 'Restore backup'
          } : {
            title: `Import ${preview.links} new bookmark${preview.links === 1 ? '' : 's'}?`,
            message: `${preview.source} · ${preview.totalLinks || preview.links} found · ${preview.folders} folder${preview.folders === 1 ? '' : 's'}. Organization: ${preview.strategy}. Existing links and folders will be reused.`,
            okLabel: `Import ${preview.links}`
          });
          if (!confirmed) {
            status.textContent = 'Import cancelled. Your library was not changed.';
            setImportWorkflowStep(0);
            return;
          }
          setImportWorkflowStep(3);
          if (backupRestore) {
            const summary = importJSON(text);
            status.textContent = backupRestoreStatus(summary);
            showToast(backupRestoreToast(summary));
            return;
          }
          const added = importBookmarksHTML(text, file.name);
          status.textContent = added > 0
            ? `Imported ${added} new link${added === 1 ? '' : 's'}. Smart tags and search indexing are running in the background.`
            : 'No new links found (all duplicates or empty).';
          if (added > 0 && lastImportBatchId) {
            const batchId = lastImportBatchId;
            showToast(`Imported ${added} link${added === 1 ? '' : 's'}`, () => undoImportBatch(batchId));
          }
        } catch (err) {
          status.textContent = 'Import failed: ' + err.message;
          setImportWorkflowStep(0);
        } finally {
          e.target.value = '';
        }
      };
      reader.onerror = () => {
        document.getElementById('importStatus').textContent = 'Import failed: the selected file could not be read.';
        setImportWorkflowStep(0);
        e.target.value = '';
      };
      reader.onabort = () => { setImportWorkflowStep(0); e.target.value = ''; };
      try { reader.readAsText(file); }
      catch (err) {
        document.getElementById('importStatus').textContent = 'Import failed: ' + err.message;
        setImportWorkflowStep(0);
        e.target.value = '';
      }
    }

    function previewImport(text, filename = '') {
      const trimmed = String(text || '').trim();
      const strategyValue = document.getElementById('importFolderStrategy')?.value || 'preserve';
      const strategyLabels = { preserve: 'keep original folders', smart: 'smart categories', inbox: 'one Inbox' };
      if (/\.json$/i.test(filename) || trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const data = JSON.parse(text);
        const sourceItems = Array.isArray(data) ? data : data?.items;
        if (!Array.isArray(sourceItems)) throw new Error('Backup items must be an array');
        const analysis = analyzeBackupRestore(sourceItems);
        const folderCount = Array.isArray(data?.folders) ? data.folders.length
          : (data?.folders && typeof data.folders === 'object') ? Object.keys(data.folders).length
          : Array.isArray(data?.projects) ? data.projects.length : 0;
        return { kind: 'json', links: analysis.added, merged: analysis.merged, totalLinks: analysis.totalLinks, folders: folderCount, source: 'saveto.me backup', strategy: 'restore backup structure' };
      }
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const sourceLinks = [...doc.querySelectorAll('a[href]')]
        .map(a => a.getAttribute('href') || '').filter(href => /^https?:/i.test(href));
      const analysis = analyzeImportCandidates(sourceLinks, items);
      const links = analysis.newLinks;
      const folderCount = doc.querySelectorAll('h3').length;
      return { links, totalLinks: analysis.totalLinks, folders: folderCount, source: browserFavoritesRoot(filename, doc), strategy: strategyLabels[strategyValue] || strategyValue };
    }

    function analyzeBackupRestore(source) {
      const knownUrls = new Set(items.map(item => normalizeUrl(item?.url)).filter(Boolean));
      let totalLinks = 0, added = 0, merged = 0;
      for (const raw of (Array.isArray(source) ? source : [])) {
        if (!raw || !raw.url) continue;
        totalLinks++;
        if (!isValidUrl(raw.url)) continue;
        const key = normalizeUrl(raw.url);
        if (!key) continue;
        if (knownUrls.has(key)) merged++;
        else { knownUrls.add(key); added++; }
      }
      return { totalLinks, added, merged };
    }

    function backupFolderRecords(data, sourceItems) {
      const records = Object.create(null);
      const objectBackup = data && !Array.isArray(data) && typeof data === 'object' ? data : {};
      if (objectBackup.folders) {
        const entries = Array.isArray(objectBackup.folders)
          ? objectBackup.folders.map(raw => [raw?.id, raw])
          : Object.entries(objectBackup.folders);
        for (const [entryId, raw] of entries) {
          const id = String(raw?.id ?? entryId ?? '').trim();
          const name = cleanFolderName(raw?.name);
          if (!raw || !id || !name || records[id]) throw new Error('Backup contains an invalid folder');
          records[id] = { ...raw, id, name, parentId: raw.parentId == null ? null : String(raw.parentId) };
        }
      } else {
        // Versions 1/2 used project names as folder ids. Turn that hierarchy into
        // folder records so it passes through the same collision-safe restore.
        const labels = new Map();
        const addLegacy = (value, label = value) => {
          if (value == null || String(value).trim() === '') return;
          const id = String(value);
          if (!labels.has(id)) labels.set(id, cleanFolderName(label) || cleanFolderName(id));
        };
        (Array.isArray(objectBackup.projects) ? objectBackup.projects : []).forEach(project => addLegacy(project));
        Object.entries(objectBackup.projectParent || {}).forEach(([child, parent]) => { addLegacy(child); addLegacy(parent); });
        sourceItems.forEach(item => addLegacy(item?.folderId ?? item?.project, item?.projectName || item?.project));
        labels.forEach((name, id) => {
          records[id] = {
            id, name, kind: 'manual', source: 'backup',
            parentId: objectBackup.projectParent?.[id] == null ? null : String(objectBackup.projectParent[id])
          };
        });
      }
      validateFolderGraph(records);
      return records;
    }

    function restoreBackupFolders(data, sourceItems) {
      const records = backupFolderRecords(data, sourceItems);
      const idMap = new Map();
      const resolving = new Set();
      const stats = { added: 0, reused: 0, idsRemapped: 0 };
      const unsafeIds = new Set(['__proto__', 'prototype', 'constructor']);

      const restoreOne = sourceId => {
        sourceId = String(sourceId);
        if (idMap.has(sourceId)) return idMap.get(sourceId);
        const raw = records[sourceId];
        if (!raw) return null;
        if (resolving.has(sourceId)) throw new Error('Folder hierarchy contains a cycle');
        resolving.add(sourceId);
        const parentId = raw.parentId ? restoreOne(raw.parentId) : null;
        const canKeepSourceId = !unsafeIds.has(sourceId) && sourceId.length <= 128;
        const existingAtId = canKeepSourceId ? folders[sourceId] : null;
        const sameAtId = existingAtId &&
          cleanFolderName(existingAtId.name).toLocaleLowerCase() === raw.name.toLocaleLowerCase() &&
          (existingAtId.parentId || null) === (parentId || null);
        const sibling = folderByName(raw.name, parentId);
        let targetId = sameAtId ? sourceId : (sibling?.id || null);

        if (!targetId) {
          targetId = (!existingAtId && canKeepSourceId) ? sourceId : newFolderId();
          while (folders[targetId] || unsafeIds.has(targetId)) targetId = newFolderId();
          folders[targetId] = {
            ...raw, id: targetId, parentId: parentId || null,
            createdAt: Number(raw.createdAt) || Date.now(), updatedAt: Number(raw.updatedAt) || Date.now()
          };
          stats.added++;
          if (targetId !== sourceId) stats.idsRemapped++;
        } else {
          stats.reused++;
          if (targetId !== sourceId) stats.idsRemapped++;
        }
        if (!customProjects.includes(targetId)) customProjects.push(targetId);
        idMap.set(sourceId, targetId);
        resolving.delete(sourceId);
        return targetId;
      };

      Object.keys(records).forEach(restoreOne);
      syncFolderParents();
      const objectBackup = data && !Array.isArray(data) && typeof data === 'object' ? data : {};
      (Array.isArray(objectBackup.priorityProjects) ? objectBackup.priorityProjects : []).forEach(sourceId => {
        const targetId = idMap.get(String(sourceId));
        if (targetId) priorityProjects.add(targetId);
      });
      if (Array.isArray(objectBackup.tagOrder)) tagOrder = mergeUniqueStrings(tagOrder, objectBackup.tagOrder);
      return { idMap, ...stats };
    }

    function normalizeBackupItem(raw, folderIdMap) {
      if (!raw || !isValidUrl(raw.url)) return null;
      const item = { ...raw, url: String(raw.url).trim() };
      let parsed = null;
      try { parsed = new URL(item.url); } catch (_) {}
      const generated = generateLinkMetadata(
        item.url, item.domain || parsed?.hostname || item.url, parsed?.pathname || '/', item.title || ''
      );
      if (!String(item.title || '').trim()) item.title = parsed?.hostname || item.url;
      if (!String(item.domain || '').trim()) item.domain = parsed?.hostname || item.url;
      if (typeof item.description !== 'string') item.description = generated.description;
      if (!Array.isArray(item.autoTags)) item.autoTags = generated.autoTags || [];
      if (!Array.isArray(item.suggestedTags)) item.suggestedTags = generated.suggestedTags || [];
      item.autoTags = mergeUniqueStrings(item.autoTags).slice(0, 64);
      item.suggestedTags = mergeUniqueStrings(item.suggestedTags).slice(0, 64);
      item.userTags = mergeUniqueStrings(Array.isArray(item.userTags) ? item.userTags : []);
      item.importedTags = mergeUniqueStrings(Array.isArray(item.importedTags) ? item.importedTags : []);
      item.note = typeof item.note === 'string' ? item.note : 'Click to add note...';
      item.pinned = Boolean(item.pinned);
      item.archived = Boolean(item.archived);

      const sourceFolder = raw.folderId ?? raw.project;
      let targetFolder = sourceFolder == null ? null : folderIdMap.get(String(sourceFolder));
      if (!targetFolder && sourceFolder != null && folders[String(sourceFolder)]) targetFolder = String(sourceFolder);
      if (!targetFolder && raw.projectName) targetFolder = folderByName(raw.projectName)?.id || null;
      if (!targetFolder) {
        const inbox = folderByName('Inbox', null) || createFolderEntity('Inbox', { kind: 'system' });
        targetFolder = inbox.id;
      }
      item.folderId = targetFolder;
      item.project = targetFolder;
      item.projectName = folderName(targetFolder);
      item.folderSource = item.folderSource || (folderKind(targetFolder) === 'manual' ? 'manual' : folderKind(targetFolder));
      if (item.importRootId != null) item.importRootId = folderIdMap.get(String(item.importRootId)) || item.importRootId;
      return item;
    }

    function mergeRestoreNotes(localNote, backupNote) {
      const clean = value => {
        const text = typeof value === 'string' ? value.trim() : '';
        return text.toLocaleLowerCase() === 'click to add note...' ? '' : text;
      };
      const local = clean(localNote), backup = clean(backupNote);
      if (!local) return backup || 'Click to add note...';
      if (!backup || local === backup || local.includes(backup)) return local;
      if (backup.includes(local)) return backup;
      return `${local}\n\n${backup}`;
    }

    function restoreFolderQuality(item) {
      const id = itemFolderId(item);
      if (!id || !folders[id]) return -1;
      const source = String(item.folderSource || folderKind(id) || '').toLocaleLowerCase();
      const score = source === 'manual' ? 40 : source === 'smart' ? 30 : source === 'browser-import' ? 20 : 10;
      return score + (/^(inbox|general|imported)$/i.test(folderName(id)) ? 0 : 5);
    }

    function mergeBackupDuplicate(existing, backup) {
      // Keep the local record as the merge base regardless of which copy has the
      // older timestamp. This preserves future/local-only fields while the shared
      // duplicate merger combines all known metadata.
      const merged = consolidateDuplicateLinks([
        { ...existing, added: 1 },
        { ...backup, added: 2 }
      ]).items[0];
      merged.id = existing.id;
      merged.url = existing.url || backup.url;
      const addedTimes = [existing.added, backup.added]
        .map(Number).filter(value => Number.isFinite(value) && value > 0);
      if (addedTimes.length) merged.added = Math.min(...addedTimes);
      else delete merged.added;
      merged.note = mergeRestoreNotes(existing.note, backup.note);
      merged.userTags = mergeUniqueStrings(existing.userTags || [], backup.userTags || []);
      merged.pinned = Boolean(existing.pinned || backup.pinned);
      merged.archived = Boolean(existing.archived && backup.archived); // active wins

      for (const key of ['contentText', 'bodyText', 'extractedText']) {
        const local = typeof existing[key] === 'string' ? existing[key] : '';
        const incoming = typeof backup[key] === 'string' ? backup[key] : '';
        if (incoming.length > local.length) merged[key] = incoming;
        else if (local) merged[key] = local;
      }
      const latestEnrichment = Number(backup.enrichedAt) > Number(existing.enrichedAt) ? backup : existing;
      const otherEnrichment = latestEnrichment === backup ? existing : backup;
      for (const key of ['normalizedUrl', 'category', 'language', 'contentHash', 'content_hash', 'thumbnail', 'enrichedAt', 'enrichmentStatus', 'semanticReady']) {
        if (latestEnrichment[key] != null) merged[key] = latestEnrichment[key];
        else if (otherEnrichment[key] != null && merged[key] == null) merged[key] = otherEnrichment[key];
      }

      const chosenFolder = restoreFolderQuality(backup) > restoreFolderQuality(existing) ? backup : existing;
      const chosenId = itemFolderId(chosenFolder);
      if (chosenId && folders[chosenId]) {
        merged.folderId = chosenId;
        merged.project = chosenId;
        merged.projectName = folderName(chosenId);
        merged.folderSource = chosenFolder.folderSource || merged.folderSource;
      }
      merged.mergedFolderIds = mergeUniqueStrings(
        existing.mergedFolderIds || [], backup.mergedFolderIds || [], itemFolderId(existing), itemFolderId(backup)
      );
      if (merged.mergedFolderIds.length < 2) delete merged.mergedFolderIds;
      return merged;
    }

    function freshRestoreItemId(usedIds) {
      let id = newItemId();
      while (usedIds.has(String(id))) id = newItemId();
      return id;
    }

    function backupRestoreStatus(summary) {
      const parts = [`${summary.added} added`, `${summary.merged} merged`, `${summary.foldersAdded} folder${summary.foldersAdded === 1 ? '' : 's'} added`];
      if (summary.invalid) parts.push(`${summary.invalid} invalid skipped`);
      const remapped = summary.itemIdsRemapped + summary.folderIdsRemapped;
      return `Restore complete: ${parts.join(' · ')}. Existing bookmark IDs were preserved.${remapped ? ` ${remapped} conflicting imported ID${remapped === 1 ? ' was' : 's were'} safely remapped.` : ''}`;
    }
    function backupRestoreToast(summary) {
      return `Backup restored · ${summary.added} added · ${summary.merged} merged`;
    }

    function importJSON(text) {
      lastImportBatchId = null;
      const data = JSON.parse(text);
      if (!Array.isArray(data) && (!data || typeof data !== 'object')) throw new Error('Backup must be a JSON object or array');
      if (!Array.isArray(data) && data.version != null && ![1, 2, 3].includes(Number(data.version))) {
        throw new Error(`Unsupported backup version: ${data.version}`);
      }
      const sourceItems = Array.isArray(data) ? data : (data.items || []);
      if (!Array.isArray(sourceItems)) throw new Error('Backup items must be an array');

      const folderRestore = restoreBackupFolders(data, sourceItems);
      const usedIds = new Set(items.map(item => String(item.id)));
      const byUrl = new Map();
      items.forEach(item => {
        const key = normalizeUrl(item?.url);
        if (key && !byUrl.has(key)) byUrl.set(key, { item, local: true });
      });
      const added = [];
      const changed = new Map();
      let merged = 0, invalid = 0, itemIdsRemapped = 0;

      for (const raw of sourceItems) {
        const backup = normalizeBackupItem(raw, folderRestore.idMap);
        if (!backup) { invalid++; continue; }
        const key = normalizeUrl(backup.url);
        const match = byUrl.get(key);
        if (match) {
          match.item = mergeBackupDuplicate(match.item, backup);
          if (match.local) changed.set(String(match.item.id), match.item);
          else added[match.addedIndex] = match.item;
          merged++;
          continue;
        }

        const hasUsableId = (typeof raw.id === 'string' || typeof raw.id === 'number') &&
          String(raw.id).trim() !== '' && String(raw.id).length <= 128;
        if (hasUsableId && !usedIds.has(String(raw.id))) backup.id = raw.id;
        else {
          if (hasUsableId) itemIdsRemapped++;
          backup.id = freshRestoreItemId(usedIds);
        }
        usedIds.add(String(backup.id));
        const addedIndex = added.push(backup) - 1;
        byUrl.set(key, { item: backup, local: false, addedIndex });
      }

      items = added.concat(items.map(item => changed.get(String(item.id)) || item));
      dbPutMany(added.concat([...changed.values()]));
      dbSaveProjects();
      refresh();
      if (added.length) scheduleImportedIntelligence(added.length);
      return {
        added: added.length, merged, invalid,
        foldersAdded: folderRestore.added, foldersReused: folderRestore.reused,
        itemIdsRemapped, folderIdsRemapped: folderRestore.idsRemapped
      };
    }

    // Walk the nested Netscape <DL> tree so sub-folders keep their parent.
    function browserFavoritesRoot(sourceName, doc) {
      const selected = document.getElementById('importBrowserSource')?.value;
      if (selected && selected !== 'auto') return `${selected} Favorites`;
      const hint = `${sourceName || ''} ${doc?.title || ''} ${doc?.querySelector('h1')?.textContent || ''}`.toLowerCase();
      const browsers = [
        ['Microsoft Edge', 'Edge'], ['Edge', 'Edge'], ['Chrome', 'Chrome'],
        ['Firefox', 'Firefox'], ['Safari', 'Safari'], ['Brave', 'Brave'],
        ['Opera', 'Opera'], ['Vivaldi', 'Vivaldi']
      ];
      const hit = browsers.find(([signal]) => hint.includes(signal.toLowerCase()));
      const browser = hit ? hit[1] : 'Other';
      return `${browser} Browser`;
    }

    function importBookmarksHTML(text, sourceName = '') {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const rootName = browserFavoritesRoot(sourceName, doc);
      const incoming = [];
      const importBatchId = `imp_${newFolderId().slice(4)}`;
      lastImportBatchId = importBatchId;
      const nodes = new Map();
      const rootTempId = 'root';
      nodes.set(rootTempId, { tempId: rootTempId, name: rootName, parentTempId: null });

      function walkDL(dl, parentTempId) {
        const kids = Array.from(dl.children);
        for (let idx = 0; idx < kids.length; idx++) {
          const el = kids[idx];
          if (el.tagName === 'DL') { walkDL(el, parentTempId); continue; }
          if (el.tagName !== 'DT') continue;
          const h3 = el.querySelector(':scope > h3, :scope > H3');
          const a = el.querySelector(':scope > a, :scope > A');
          if (h3) {
            const name = (h3.textContent || '').trim() || 'Imported';
            const tempId = `node_${nodes.size}_${newFolderId().slice(-8)}`;
            nodes.set(tempId, { tempId, name, parentTempId: parentTempId || rootTempId });
            let sub = el.querySelector(':scope > dl, :scope > DL');
            if (!sub) { const next = kids[idx + 1]; if (next && next.tagName === 'DL') { sub = next; idx++; } }
            if (sub) walkDL(sub, tempId);
          } else if (a) {
            const href = a.getAttribute('href') || '';
            if (!/^https?:/i.test(href)) continue;   // skip javascript:, place:, data: etc.
            const importedTags = String(a.getAttribute('tags') || '').split(',').map(tag => tag.trim()).filter(Boolean);
            incoming.push({ url: href, title: (a.textContent || '').trim(), sourceFolderTempId: parentTempId || rootTempId, importedTags });
          }
        }
      }
      const topDL = doc.querySelector('dl');
      if (topDL) walkDL(topDL, rootTempId);

      // De-duplicate before creating any folder entities. A repeated import, or
      // a partially overlapping import, must not leave a second empty copy of
      // the browser hierarchy behind.
      const existingUrls = new Set(items.map(item => normalizeUrl(item.url)));
      const incomingUrls = new Set();
      const newIncoming = incoming.filter(link => {
        const normalized = normalizeUrl(link.url);
        if (!normalized || existingUrls.has(normalized) || incomingUrls.has(normalized)) return false;
        incomingUrls.add(normalized);
        return true;
      });
      if (!newIncoming.length) { lastImportBatchId = null; return 0; }

      const neededNodes = new Set([rootTempId]);
      for (const link of newIncoming) {
        let tempId = link.sourceFolderTempId || rootTempId;
        while (tempId && !neededNodes.has(tempId)) {
          neededNodes.add(tempId);
          tempId = nodes.get(tempId)?.parentTempId;
        }
      }

      const strategy = document.getElementById('importFolderStrategy')?.value || 'preserve';
      // Browser hierarchy is created only when explicitly requested. Smart mode
      // retains the source folder on each item but uses the stable taxonomy.
      const source = rootName.replace(/ (?:Favorites|Browser)$/, '').toLowerCase();
      const rootFolder = createFolderEntity(rootName, { kind: 'browser-import', source, importBatchId, allowSmartAssignment: false });
      const folderIdsByTemp = new Map([[rootTempId, rootFolder.id]]);
      if (strategy === 'preserve') {
        for (const node of [...nodes.values()].filter(node => node.tempId !== rootTempId && neededNodes.has(node.tempId))) {
          const parentId = folderIdsByTemp.get(node.parentTempId) || rootFolder.id;
          const folder = createFolderEntity(node.name, { parentId, kind: 'browser-import', source, importBatchId, allowSmartAssignment: false });
          folderIdsByTemp.set(node.tempId, folder.id);
        }
        newIncoming.forEach(link => { link.folderId = folderIdsByTemp.get(link.sourceFolderTempId) || rootFolder.id; });
      }
      const added = ingestLinks(newIncoming, { strategy, rootName, rootFolderId: rootFolder.id, source, importBatchId });
      dbSaveProjects();
      renderSidebar();
      renderSubfolderBar();
      return added;
    }

    async function undoImportBatch(importBatchId) {
      const removedItems = items.filter(item => item.importBatchId === importBatchId);
      const removedIds = new Set(removedItems.map(item => item.id));
      items = items.filter(item => !removedIds.has(item.id));
      if (removedIds.size) {
        dbDeleteMany([...removedIds]);
        removedIds.forEach(id => cloudMarkDeleted(id));
      }
      const folderIds = Object.values(folders).filter(folder => folder.importBatchId === importBatchId).map(folder => folder.id);
      const folderSet = new Set(folderIds);
      for (const id of folderIds) {
        delete folders[id]; delete projectParent[id]; delete projectMeta[id];
        priorityProjects.delete(id); projectCollapsed.delete(id);
      }
      for (const folder of Object.values(folders)) {
        if (folder.parentId && folderSet.has(folder.parentId)) { folder.parentId = null; delete projectParent[folder.id]; }
      }
      customProjects = customProjects.filter(id => !folderSet.has(id));
      if (activeFilter && folderSet.has(activeFilter)) activeFilter = null;
      dbSaveProjects(); refresh();
      await _idbWriteQueue;
      cloudSchedulePush();
      showToast(`Import removed · ${removedItems.length} link${removedItems.length === 1 ? '' : 's'}`);
    }

    async function confirmReclassify() {
      const ok = await uiConfirm({
        title: 'Re-classify all links?',
        message: `Re-tags and re-describes all ${items.length} link${items.length === 1 ? '' : 's'} with the latest rules, and re-files ones in an ill-fitting auto-folder. Notes, pins, and manual folders are kept.`,
        okLabel: 'Re-classify',
      });
      if (!ok) return;
      try { await reclassifyAllLinks(); }
      catch (error) { console.error('Re-classification failed', error); showToast('Re-classification paused. Your existing links are safe.'); }
    }

    // Re-run the (improved) on-device classifier over every stored link.
    // Refreshes tags + description. Respects learned per-domain overrides
    // (applied inside generateLinkMetadata) and never touches user notes,
    // titles, pins, or manually-created (priority) folders. Links still sitting
    // in an AUTO folder that was named after a tag they no longer carry get
    // re-filed into the newly inferred folder (this is what fixes the old
    // "stockx.com → Social" mistakes).
    async function reclassifyAllLinks() {
      let tagChanged = 0, moved = 0;
      const touched = [];
      for (const it of items) {
        if (!it || !it.url) continue;
        let host = it.domain || '', path = '/';
        try { const u = new URL(it.url); host = host || u.hostname; path = u.pathname; } catch (_) {}
        const oldTags = (it.autoTags || []).slice();
        const meta = generateLinkMetadata(it.url, host || it.url, path, it.title || prettifyTitle(path, host));

        const sameTags = oldTags.length === meta.autoTags.length &&
          oldTags.every((t, i) => t === meta.autoTags[i]);
        let dirty = false;
        if (!sameTags) { it.autoTags = meta.autoTags; tagChanged++; dirty = true; }
        const nextSuggested = meta.suggestedTags || [];
        const sameSuggested = JSON.stringify(it.suggestedTags || []) === JSON.stringify(nextSuggested);
        if (!sameSuggested) { it.suggestedTags = nextSuggested; dirty = true; }
        if ((it.description || '') !== (meta.description || '')) { it.description = meta.description; dirty = true; }

        // Re-file only when the current folder is an AUTO (non-priority) folder
        // that was clearly named after an OLD tag the link no longer has.
        const proj = it.project;
        if (proj && !priorityProjects.has(proj)) {
          const pl = proj.toLowerCase();
          const matchedOld = oldTags.some(t => t.toLowerCase() === pl);
          const matchedNew = meta.autoTags.some(t => t.toLowerCase() === pl);
          if (matchedOld && !matchedNew) {
            const dest = inferProjectName(meta.autoTags, host);
            if (dest) { const destId = ensureProject(dest, false, { kind: 'smart' }); if (destId !== proj) { it.project = destId; it.folderId = destId; it.projectName = folderName(destId); moved++; dirty = true; } }
          }
        }
        if (dirty) touched.push(it);
      }
      if (touched.length) {
        dbPutMany(touched);
        dbSaveProjects();
        await _idbWriteQueue;
        await cloudPushNow();
      }
      refresh();
      showToast(`Re-classified ${items.length} link${items.length === 1 ? '' : 's'} · ${touched.length} updated · ${tagChanged} re-tagged · ${moved} moved`);
      if (cloud.mode && !privacyMode) enrichPendingLibrary(250, true).catch(error => console.warn('Post-classification indexing paused', error));
    }

    // Shared merge: dedupe by normalized URL, fill missing metadata, persist.
    function ingestLinks(incoming, options = {}) {      const existing = new Set(items.map(i => normalizeUrl(i.url)));
      const toAdd = [];
      const smartFolders = new Map();
      for (const raw of incoming) {
        if (!raw || !raw.url) continue;
        const norm = normalizeUrl(raw.url);
        if (existing.has(norm)) continue;
        existing.add(norm);
        let host = raw.domain || '', path = '/';
        try { const u = new URL(raw.url); host = host || u.hostname; path = u.pathname; } catch (_) {}
        const meta = generateLinkMetadata(raw.url, host || raw.url, path, raw.title || prettifyTitle(path, host));
        const strategy = options.strategy || 'preserve';
        const importRoot = String(options.rootName || '').trim();
        const importRootId = options.rootFolderId || null;
        const sourceProject = String(raw.project || '').trim();
        let project = raw.folderId && folders[raw.folderId] ? raw.folderId : null;
        if (!project && options.backupImport) {
          project = raw.folderId && folders[raw.folderId] ? raw.folderId : (folders[raw.project] ? raw.project : null);
        }
        if (!project && strategy === 'preserve') {
          project = ensureProject(sourceProject || importRoot || 'Inbox', false, { kind: options.importBatchId ? 'browser-import' : 'manual', parentId: importRootId, source: options.source, importBatchId: options.importBatchId, allowSmartAssignment: !options.importBatchId });
        }
        if (!project && (strategy === 'smart' || strategy === 'inbox')) {
          const visibleName = strategy === 'inbox' ? 'Inbox' : smartImportProject(meta);
          const cacheKey = `${importRootId || 'root'}:${visibleName}`;
          if (!smartFolders.has(cacheKey)) {
            const folder = createFolderEntity(visibleName, { parentId: importRootId, kind: 'browser-import', source: options.source, importBatchId: options.importBatchId, allowSmartAssignment: false });
            smartFolders.set(cacheKey, folder.id);
          }
          project = smartFolders.get(cacheKey);
        }
        if (!project) project = ensureProject('Inbox', false, { kind: 'system' });
        const importedTags = Array.isArray(raw.importedTags) ? raw.importedTags : [];
        const backupState = options.backupImport ? {
          userTags: mergeUniqueStrings(raw.userTags || []).slice(0, 64),
          importedTags: mergeUniqueStrings(importedTags).slice(0, 64),
          pinned: !!raw.pinned,
          archived: !!raw.archived,
          imported: !!raw.imported,
          lastOpened: Number(raw.lastOpened) || undefined,
          snoozedUntil: Number(raw.snoozedUntil) || undefined,
          category: raw.category || undefined,
          language: raw.language || undefined,
          contentText: raw.contentText || undefined,
          contentHash: raw.contentHash || undefined,
          normalizedUrl: raw.normalizedUrl || undefined,
          enrichedAt: raw.enrichedAt || undefined,
          enrichmentStatus: raw.enrichmentStatus || undefined,
          semanticReady: !!raw.semanticReady,
          folderSource: raw.folderSource || 'manual',
          importRoot: raw.importRoot || null,
          importRootId: raw.importRootId || null,
          originalProject: raw.originalProject || null
        } : {};
        toAdd.push({
          id: newItemId(),
          added: raw.added || Date.now(),
          url: raw.url,
          title: raw.title || host || raw.url,
          domain: host || raw.url,
          description: raw.description || meta.description,
          autoTags: mergeUniqueStrings(raw.autoTags || [], importedTags, meta.autoTags || []).slice(0, 10),
          suggestedTags: mergeUniqueStrings(raw.suggestedTags || [], meta.suggestedTags || []).slice(0, 10),
          note: raw.note || 'Click to add note...',
          project, projectName: folderName(project), folderId: project,
          imported: true,
          importRoot: importRoot || null,
          importRootId,
          importBatchId: options.importBatchId || null,
          folderSource: 'browser-import',
          originalProject: sourceProject || null,
          ...backupState
        });
      }
      if (toAdd.length) {
        items = toAdd.concat(items);
        dbPutMany(toAdd);
        dbSaveProjects();
        refresh();
        scheduleImportedIntelligence(toAdd.length);
      }
      return toAdd.length;
    }

    // ==========================================================================
    //  Persistence — IndexedDB (scales past 100k links; async, no 5 MB cap)
    //  Targeted writes only touch changed rows — we never rewrite the whole store.
    // ==========================================================================
    const DB_NAME = 'savemeDB', DB_VERSION = 1;
    let _db = null;
    let _idbWriteQueue = Promise.resolve();

    function openDB() {
      return new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (e) { return reject(e); }
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('links')) {
            const s = db.createObjectStore('links', { keyPath: 'id' });
            s.createIndex('project', 'project', { unique: false });
            s.createIndex('domain', 'domain', { unique: false });
            s.createIndex('tags', 'autoTags', { unique: false, multiEntry: true });
          }
          if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    function idbGetAll(store) {
      return new Promise((resolve, reject) => {
        const req = _db.transaction(store, 'readonly').objectStore(store).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
    function idbGet(store, key) {
      return new Promise((resolve, reject) => {
        const req = _db.transaction(store, 'readonly').objectStore(store).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    function idbTransactionDone(tx) {
      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('Browser storage write failed'));
        tx.onabort = () => reject(tx.error || new Error('Browser storage write was aborted'));
      });
    }

    function enqueueIdbWrite(write) {
      if (!_db) return Promise.resolve();
      _idbWriteQueue = _idbWriteQueue.then(write).catch((error) => {
        console.error('IndexedDB write failed', error);
        showToast('Could not save locally. Please export a backup and check browser storage.');
      });
      return _idbWriteQueue;
    }

    function dbPut(item) {
      item.updatedAt = Date.now();
      enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); tx.objectStore('links').put(item); return idbTransactionDone(tx); });
      cloudMarkDirty(item.id); cloudSchedulePush();
    }
    function dbPutMany(arr) {
      if (!arr || !arr.length) return;
      const now = Date.now(); arr.forEach(i => { i.updatedAt = now; });
      enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); const s = tx.objectStore('links'); arr.forEach(i => s.put(i)); return idbTransactionDone(tx); });
      arr.forEach(i => cloudMarkDirty(i.id)); cloudSchedulePush();
    }
    function dbDelete(id) {
      enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); tx.objectStore('links').delete(id); return idbTransactionDone(tx); });
      cloudMarkDeleted(id); cloudSchedulePush();
    }
    function dbDeleteMany(ids) {
      if (!ids || !ids.length) return;
      enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); const s = tx.objectStore('links'); ids.forEach(id => s.delete(id)); return idbTransactionDone(tx); });
      ids.forEach(id => cloudMarkDeleted(id)); cloudSchedulePush();
    }

    let lastDedupedItemCount = -1;
    function consolidateStoredDuplicates(force = false) {
      if (!force && lastDedupedItemCount === items.length) return 0;
      const result = consolidateDuplicateLinks(items);
      lastDedupedItemCount = result.items.length;
      if (!result.removed.length) return 0;
      items = result.items;
      // Persist the merged survivor first, then propagate tombstones for every
      // discarded id. This prevents cloud sync from resurrecting old copies.
      dbPutMany(result.merged);
      dbDeleteMany(result.removed.map(entry => entry.id));
      return result.removed.length;
    }
    function dbSaveProjects()  {
      if (!cloud.suspend) {
        cloud.settingsDirty = true;
        cloud.settingsRevision += 1;
      }
      cloudSchedulePush();
      if (!_db) return;
      enqueueIdbWrite(() => {
        const tx = _db.transaction('meta', 'readwrite');
        const s = tx.objectStore('meta');
        s.put({ key: 'customProjects', value: customProjects });
        s.put({ key: 'priorityProjects', value: [...priorityProjects] });
        s.put({ key: 'projectParent', value: projectParent });
        s.put({ key: 'projectCollapsed', value: [...projectCollapsed] });
        s.put({ key: 'tagOrder', value: tagOrder });
        s.put({ key: 'projectMeta', value: projectMeta });
        s.put({ key: 'folders', value: folders });
        s.put({ key: 'folderSchemaVersion', value: FOLDER_SCHEMA_VERSION });
        return idbTransactionDone(tx);
      });
    }

    function isLegacyDemoItem(item) {
      const id = Number(item && item.id);
      return Number.isInteger(id) && LEGACY_DEMO_URLS.get(id) === item.url;
    }

    // Remove only the exact records shipped in the old demo. Matching both id
    // and URL avoids deleting a genuine bookmark that happens to use the same URL.
    function cleanupLegacyDemoData(pruneEmptyProjects = false) {
      const demoItems = items.filter(isLegacyDemoItem);
      if (demoItems.length) {
        items = items.filter(item => !isLegacyDemoItem(item));
        dbDeleteMany(demoItems.map(item => item.id));
      }
      if (demoItems.length || pruneEmptyProjects) {
        const usedProjects = new Set(items.map(item => item.project).filter(Boolean));
        customProjects = customProjects.filter(project => usedProjects.has(project));
        priorityProjects = new Set([...priorityProjects].filter(project => usedProjects.has(project)));
        projectCollapsed = new Set([...projectCollapsed].filter(project => usedProjects.has(project)));
        projectParent = Object.fromEntries(Object.entries(projectParent).filter(([child, parent]) => usedProjects.has(child) && usedProjects.has(parent)));
        projectMeta = Object.fromEntries(Object.entries(projectMeta).filter(([project]) => usedProjects.has(project)));
        const usedTags = new Set(items.flatMap(item => [...(item.autoTags || []), ...(item.userTags || [])]).map(tag => String(tag).toLowerCase()));
        tagOrder = tagOrder.filter(tag => usedTags.has(String(tag).toLowerCase()));
        dbSaveProjects();
      }
      return demoItems.length;
    }

    async function initStore() {
      try { _db = await openDB(); }
      catch (e) {
        console.warn('IndexedDB unavailable — running in-memory only', e);
        // Surface the data-loss risk instead of failing silently: without IDB
        // (private browsing / disabled storage) nothing persists across reloads.
        setTimeout(() => showToast('Storage is unavailable — links won’t be saved after you close this tab. Sign in to sync, or enable site storage.'), 800);
        refresh(); recordNav(); return;
      }
      try {
        const saved = await idbGetAll('links');
        items = saved;
        const meta = await idbGet('meta', 'customProjects');
        if (meta && Array.isArray(meta.value)) customProjects = meta.value;
        const pmeta = await idbGet('meta', 'priorityProjects');
        if (pmeta && Array.isArray(pmeta.value)) priorityProjects = new Set(pmeta.value);
        const ppar = await idbGet('meta', 'projectParent');
        if (ppar && ppar.value && typeof ppar.value === 'object') projectParent = ppar.value;
        const pcol = await idbGet('meta', 'projectCollapsed');
        if (pcol && Array.isArray(pcol.value)) projectCollapsed = new Set(pcol.value);
        const tord = await idbGet('meta', 'tagOrder');
        if (tord && Array.isArray(tord.value)) tagOrder = tord.value;
        const pm = await idbGet('meta', 'projectMeta');
        if (pm && pm.value && typeof pm.value === 'object') projectMeta = pm.value;
        const storedFolders = await idbGet('meta', 'folders');
        if (storedFolders && storedFolders.value && typeof storedFolders.value === 'object') folders = storedFolders.value;
        const seedVersion = await idbGet('meta', 'seedVersion');
        cleanupLegacyDemoData(Boolean(seedVersion));
        enqueueIdbWrite(() => {
          const tx = _db.transaction('meta', 'readwrite');
          tx.objectStore('meta').delete('seedVersion');
          return idbTransactionDone(tx);
        });
      } catch (e) { console.warn('IndexedDB load failed — using in-memory data', e); }
      if (!Object.keys(folders).length) repairFolderAssignments();
      const migratedFolders = migrateLegacyFolders();
      if (migratedFolders) { dbPutMany(items); dbSaveProjects(); }
      migrateBrowserRootNames();
      repairStableImportedBucket();
      consolidateStoredDuplicates(true);
      refresh();
      recordNav();
      handleAddParam();   // save a link passed via the quick-capture bookmarklet (?add=)
    }

    // ==========================================================================
    //  Drag-and-drop import — drop a bookmarks .html/.json file anywhere on the
    //  app (or a bookmark/link) to import it. No settings dialog needed.
    // ==========================================================================
    function initDropImport() {
      const zone = document.createElement('div');
      zone.id = 'dropZone';
      zone.innerHTML = '<div class="drop-inner"><div class="drop-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></div><div class="drop-title">Drop to import</div><div class="drop-sub">Bookmarks .html / .json backup, or a link</div></div>';
      document.body.appendChild(zone);

      let depth = 0;
      const show = () => zone.classList.add('show');
      const hide = () => { depth = 0; zone.classList.remove('show'); };
      const hasFileOrLink = (dt) => dt && Array.from(dt.types || []).some(t => t === 'Files' || t === 'text/uri-list' || t === 'text/plain');

      window.addEventListener('dragenter', (e) => {
        if (!hasFileOrLink(e.dataTransfer) || dragKind) return;   // ignore internal card/project drags
        e.preventDefault(); depth++; show();
      });
      window.addEventListener('dragover', (e) => { if (zone.classList.contains('show')) e.preventDefault(); });
      window.addEventListener('dragleave', (e) => {
        if (!zone.classList.contains('show')) return;
        depth--; if (depth <= 0) hide();
      });
      window.addEventListener('drop', (e) => {
        if (!zone.classList.contains('show')) return;
        e.preventDefault(); hide();
        const dt = e.dataTransfer;
        const file = dt.files && dt.files[0];
        if (file) { importDroppedFile(file); return; }
        const uri = (dt.getData('text/uri-list') || dt.getData('text/plain') || '').trim();
        const href = uri.split('\n').map(s => s.trim()).find(s => /^https?:/i.test(s));
        if (href) {
          const added = ingestLinks([{ url: href }]);
          showToast(added ? 'Link imported.' : 'Already saved (duplicate).');
        }
      });
    }

    function importDroppedFile(file) {
      if (!/\.(html?|json)$/i.test(file.name)) { showToast('Drop a .html bookmarks file or a .json backup.'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result), trimmed = text.trim();
          const backupRestore = /\.json$/i.test(file.name) || trimmed.startsWith('{') || trimmed.startsWith('[');
          if (backupRestore) {
            const summary = importJSON(text);
            showToast(backupRestoreToast(summary));
          } else {
            const added = importBookmarksHTML(text, file.name);
            showToast(added > 0 ? `Imported ${added} new link${added === 1 ? '' : 's'}.` : 'No new links (all duplicates).');
          }
        } catch (err) { showToast('Import failed: ' + err.message); }
      };
      reader.readAsText(file);
    }

    // ==========================================================================
    //  Cloud accounts + sync (optional). Talks to the Cloudflare Worker /api/*.
    //  Degrades silently to local-only IndexedDB mode when no backend answers
    //  (opening the file directly, or before the Worker is deployed), so the app
    //  keeps working exactly as before until you sign in.
    // ==========================================================================
    // Delta sync: per-bookmark changes carry their own updatedAt and are merged
    // server-side per row, so two devices editing at once no longer clobber each
    // other. `dirty` = ids changed since last push; `deletes` = id->timestamp
    // tombstones (persisted so an offline delete isn't resurrected on reload);
    // projects/tags/view prefs ride along as a single versioned settings blob.
    const cloud = { user: null, mode: false, suspend: false, timer: null,
                    lastSync: 0, settingsSyncedAt: 0, settingsDirty: false,
                    dirty: new Set(), deletes: new Map(), pulling: false,
                    changeRevision: 0, changeRevisions: new Map(), settingsRevision: 0,
                    lastError: null, retryTimer: null, retryAttempt: 0 };
    const ACCOUNT_PREVIEW_KEY = 'savemeAccountPreviewV1';
    const ACCOUNT_PREVIEW_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
    function normalizeAccountPreview(user) {
      if (!user || typeof user !== 'object') return null;
      const name = String(user.name || '').trim().slice(0, 120);
      const email = String(user.email || '').trim().slice(0, 254);
      const avatar = String(user.avatar || '').trim().slice(0, 2048);
      if (!name && !email) return null;
      return { name, email, avatar, savedAt: Date.now() };
    }
    function readAccountPreview() {
      try {
        const cached = JSON.parse(localStorage.getItem(ACCOUNT_PREVIEW_KEY) || 'null');
        if (!cached || !cached.savedAt || Date.now() - Number(cached.savedAt) > ACCOUNT_PREVIEW_MAX_AGE) {
          localStorage.removeItem(ACCOUNT_PREVIEW_KEY);
          return null;
        }
        return normalizeAccountPreview(cached);
      } catch (_) { return null; }
    }
    let accountPreview = readAccountPreview();
    let accountPreviewState = accountPreview ? 'checking' : 'none';
    function saveAccountPreview(user) {
      accountPreview = normalizeAccountPreview(user);
      accountPreviewState = accountPreview ? 'verified' : 'none';
      try {
        if (accountPreview) localStorage.setItem(ACCOUNT_PREVIEW_KEY, JSON.stringify(accountPreview));
        else localStorage.removeItem(ACCOUNT_PREVIEW_KEY);
      } catch (_) {}
    }
    function clearAccountPreview() {
      accountPreview = null;
      accountPreviewState = 'none';
      try { localStorage.removeItem(ACCOUNT_PREVIEW_KEY); } catch (_) {}
    }

    function cloudMarkDirty(id) {
      if (!cloud.mode || cloud.suspend) return;
      id = String(id);
      cloud.changeRevisions.set(id, ++cloud.changeRevision);
      cloud.dirty.add(id);
      cloud.deletes.delete(id);
    }
    function cloudMarkDeleted(id) {
      if (!cloud.mode || cloud.suspend) return;
      id = String(id);
      cloud.changeRevisions.set(id, ++cloud.changeRevision);
      cloud.dirty.delete(id);
      cloud.deletes.set(id, Date.now());
      persistDeletes();
    }
    function persistDeletes() {
      enqueueIdbWrite(() => { const tx = _db.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ key: 'pendingDeletes', value: [...cloud.deletes.entries()] }); return idbTransactionDone(tx); });
    }

    function clearCloudRetry() {
      if (cloud.retryTimer) clearTimeout(cloud.retryTimer);
      cloud.retryTimer = null;
      cloud.retryAttempt = 0;
    }
    function scheduleCloudRetry() {
      if (!cloud.mode || cloud.retryTimer || !navigator.onLine) return;
      const delays = [3_000, 10_000, 30_000, 60_000, 120_000];
      const delay = delays[Math.min(cloud.retryAttempt, delays.length - 1)];
      cloud.retryAttempt += 1;
      cloud.retryTimer = setTimeout(() => {
        cloud.retryTimer = null;
        cloudSync(false);
      }, delay);
    }
    async function retryCloudSync() {
      if (!cloud.mode) { openLogin(); return; }
      if (cloud.retryTimer) clearTimeout(cloud.retryTimer);
      cloud.retryTimer = null;
      cloud.retryAttempt = 0;
      showToast('Retrying cloud sync…');
      await cloudSync(false);
      if (!cloud.lastError) showToast('Library synced');
    }

    async function cloudInit() {
      let res;
      try { res = await fetch('/api/me', { headers: { Accept: 'application/json' } }); }
      catch (e) {
        if (accountPreview) { accountPreviewState = 'offline'; renderAccountUI(); }
        return;                                           // no backend -> stay local
      }
      if (res.status === 404) {
        if (accountPreview) { accountPreviewState = 'offline'; renderAccountUI(); }
        return;                                           // not the Worker (plain static host)
      }
      let data = null; try { data = await res.json(); } catch (e) {}
      if (!res.ok || !data || !data.user) {
        clearAccountPreview();
        renderAccountUI();
        return;                                           // signed out
      }
      cloud.user = data.user; cloud.mode = true;
      saveAccountPreview(data.user);
      renderAccountUI();                                  // identity is visible before the first full sync
      const pd = await idbGet('meta', 'pendingDeletes');
      if (pd && Array.isArray(pd.value)) pd.value.forEach(([id, ts]) => cloud.deletes.set(String(id), ts));
      await cloudSync(true);                              // full merge on login
      renderAccountUI();
      updateSearchModeButton();
      updateLibraryIntelStatus();
      enrichPendingLibrary(50, true).catch(error => console.warn('Automatic library enrichment paused', error));
      resumeHealthJob(true);
      // Keep devices converged: pull on focus and on a slow interval.
      window.addEventListener('focus', () => cloudSync(false));
      window.addEventListener('online', () => retryCloudSync());
      setInterval(() => cloudSync(false), 30000);
    }

    function sameId(a, b) { return String(a) === String(b); }

    // Pull changes (delta since lastSync, or everything when full) and merge
    // them into local state, then push whatever is still pending.
    async function cloudSync(full) {
      if (!cloud.mode || cloud.pulling) return;
      cloud.pulling = true;
      try {
        const since = full ? 0 : cloud.lastSync;
        cloud.suspend = true;
        let cursor = null;
        let finalNow = null;
        do {
          const endpoint = cursor ? '/api/sync?cursor=' + encodeURIComponent(cursor) : '/api/sync?since=' + since;
          const res = await fetch(endpoint, { headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error('Sync pull failed (' + res.status + ')');
          const d = await res.json();
          (d.items || []).forEach(row => {
            const local = items.find(i => sameId(i.id, row.id));
            const decision = decideRemoteSync(local, row,
              cloud.dirty.has(String(row.id)), cloud.deletes.has(String(row.id)));
            if (decision === 'delete') removeItemLocal(row.id);
            else if (decision === 'upsert') upsertItemLocal(row.data);
          });
          if (d.settings && d.settings.blob && (d.settings.updatedAt || 0) > cloud.settingsSyncedAt && !cloud.settingsDirty) {
            hydrateSettings(d.settings.blob);
            cloud.settingsSyncedAt = d.settings.updatedAt;
          }
          cursor = d.nextCursor || null;
          if (d.now) finalNow = d.now;
        } while (cursor);
        cloud.suspend = false;
        // A signed-in account may still hold the old demo rows in D1. Delete
        // those exact rows and obsolete empty demo folders on the first full sync.
        if (full) cleanupLegacyDemoData(true);
        if (!Object.keys(folders).length) repairFolderAssignments();
        const migratedFolders = migrateLegacyFolders();
        if (migratedFolders) { dbPutMany(items); dbSaveProjects(); }
        migrateBrowserRootNames();
        repairStableImportedBucket();
        const duplicatesMerged = consolidateStoredDuplicates(true);
        if (finalNow) cloud.lastSync = finalNow;
        cloud.lastError = null;
        // First login from this device: push everything local so the server
        // gets anything it didn't already have (per-row merge makes this safe).
        if (full) {
          items.forEach(i => cloud.dirty.add(String(i.id)));
          if (!cloud.settingsSyncedAt) cloud.settingsDirty = true;
        }
        refresh();
        await cloudPushNow();
        if (duplicatesMerged) showToast(`Merged ${duplicatesMerged} duplicate link${duplicatesMerged === 1 ? '' : 's'}`);
        if (!cloud.lastError) clearCloudRetry();
      } catch (e) {
        cloud.suspend = false;
        cloud.lastError = e && e.message ? e.message : 'Sync failed';
        console.error('Cloud sync failed', e);
        scheduleCloudRetry();
        renderAccountUI();
      }
      finally { cloud.pulling = false; }
    }

    function removeItemLocal(id) {
      const local = items.find(i => sameId(i.id, id));
      items = items.filter(i => !sameId(i.id, id));
      const key = local ? local.id : id;
      enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); tx.objectStore('links').delete(key); return idbTransactionDone(tx); });
    }
    function upsertItemLocal(data) {
      if (!data || data.id == null) return;
      const idx = items.findIndex(i => sameId(i.id, data.id));
      if (idx >= 0) {
        items[idx] = data;
        enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); tx.objectStore('links').put(data); return idbTransactionDone(tx); });
        return;
      }

      // An older local import can represent the same bookmark with a different
      // client id. Adopt the authoritative cloud id instead of appending a
      // second row, while merging richer local notes, tags, and folder data.
      const normalized = normalizeUrl(data.url);
      const urlIdx = items.findIndex(item => item.url && normalizeUrl(item.url) === normalized);
      if (urlIdx >= 0) {
        const previous = items[urlIdx];
        const merged = consolidateDuplicateLinks([previous, data]).items[0];
        merged.id = data.id;
        merged.updatedAt = Math.max(Number(previous.updatedAt) || 0, Number(data.updatedAt) || 0);
        items[urlIdx] = merged;
        enqueueIdbWrite(() => {
          const tx = _db.transaction('links', 'readwrite');
          const store = tx.objectStore('links');
          if (!sameId(previous.id, data.id)) store.delete(previous.id);
          store.put(merged);
          return idbTransactionDone(tx);
        });
        return;
      }

      items.push(data);
      enqueueIdbWrite(() => { const tx = _db.transaction('links', 'readwrite'); tx.objectStore('links').put(data); return idbTransactionDone(tx); });
    }

    function settingsSnapshot() {
      return {
        folderSchemaVersion: FOLDER_SCHEMA_VERSION,
        folders,
        customProjects,
        priorityProjects: [...priorityProjects],
        projectParent,
        projectCollapsed: [...projectCollapsed],
        tagOrder, projectMeta
      };
    }
    function hydrateSettings(b) {
      if (!b || typeof b !== 'object') return;
      if (b.folders && typeof b.folders === 'object' && !Array.isArray(b.folders)) folders = b.folders;
      if (Array.isArray(b.customProjects)) customProjects = b.customProjects;
      if (Array.isArray(b.priorityProjects)) priorityProjects = new Set(b.priorityProjects);
      if (b.projectParent && typeof b.projectParent === 'object') projectParent = b.projectParent;
      if (Array.isArray(b.projectCollapsed)) projectCollapsed = new Set(b.projectCollapsed);
      if (Array.isArray(b.tagOrder)) tagOrder = b.tagOrder;
      if (b.projectMeta && typeof b.projectMeta === 'object') projectMeta = b.projectMeta;
      if (Object.keys(folders).length) { validateFolderGraph(folders); syncFolderParents(); }
    }
    function cloudSchedulePush() {
      if (!cloud.mode || cloud.suspend) return;
      clearTimeout(cloud.timer);
      cloud.timer = setTimeout(cloudPushNow, 800);
    }
    async function cloudPushNow({ throwOnError = false } = {}) {
      if (!cloud.mode) return;
      const dirtyIds = [...cloud.dirty];
      const delEntries = [...cloud.deletes.entries()];
      const settingsDirty = cloud.settingsDirty;
      if (!dirtyIds.length && !delEntries.length && !settingsDirty) return;
      // Build the full change list, then send it in bounded batches so a large
      // library (e.g. a first-login push of 100k+ items) never exceeds the
      // worker's per-request cap. Each batch clears only the ids it confirmed.
      const changes = [];
      const sentSnapshots = new Map();
      dirtyIds.forEach(id => {
        const it = items.find(i => sameId(i.id, id));
        if (!it) return;
        const updatedAt = it.updatedAt || Date.now();
        changes.push({ id: String(it.id), data: prepareItemForSync(it), updatedAt });
        sentSnapshots.set(String(it.id), { kind: 'upsert', revision: cloud.changeRevisions.get(String(it.id)) || 0, updatedAt });
      });
      delEntries.forEach(([id, ts]) => {
        changes.push({ id, deleted: 1, updatedAt: ts });
        sentSnapshots.set(String(id), { kind: 'delete', revision: cloud.changeRevisions.get(String(id)) || 0, updatedAt: ts });
      });
      const settingsRevision = cloud.settingsRevision;
      const settingsPayload = settingsDirty ? { blob: settingsSnapshot(), updatedAt: Date.now() } : null;
      const batches = buildSyncBatches(changes, settingsPayload);
      try {
        for (const body of batches) {
          const batch = body.items;
          const res = await fetch('/api/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const d = await res.json().catch(() => null);
          if (!res.ok) {
            const reason = d && (d.error || (Array.isArray(d.errors) && d.errors[0]) || (Array.isArray(d.details) && d.details[0]));
            if (res.status === 413 || reason === 'payload_too_large') throw new Error('A sync batch was too large. Please retry with the updated batching logic.');
            if (res.status === 401) throw new Error('Your cloud session expired. Please sign in again.');
            throw new Error(`Sync failed (${res.status}${reason ? `: ${reason}` : ''})`);
          }
          const appliedAt = d && (d.appliedAt || d.now);
          batch.forEach(ch => {
            const id = String(ch.id);
            const sent = sentSnapshots.get(id);
            const liveDeleteAt = cloud.deletes.get(id);
            const liveItem = items.find(it => sameId(it.id, id));
            const current = liveDeleteAt != null
              ? { kind: 'delete', revision: cloud.changeRevisions.get(id) || 0, updatedAt: liveDeleteAt }
              : liveItem
                ? { kind: 'upsert', revision: cloud.changeRevisions.get(id) || 0, updatedAt: liveItem.updatedAt || 0 }
                : null;
            if (!isSyncSnapshotCurrent(sent, current)) return;
            if (ch.deleted) cloud.deletes.delete(id);
            else {
              cloud.dirty.delete(id);
              if (appliedAt && liveItem) liveItem.updatedAt = appliedAt;
            }
            cloud.changeRevisions.delete(id);
          });
          if (body.settings && cloud.settingsDirty && cloud.settingsRevision === settingsRevision) {
            cloud.settingsDirty = false;
            cloud.settingsSyncedAt = appliedAt || body.settings.updatedAt;
          }
          cloud.lastError = null;
          clearCloudRetry();
          persistDeletes();
        }
      } catch (e) {
        cloud.lastError = e && e.message ? e.message : 'Sync failed';
        console.error('Cloud push failed', e);
        scheduleCloudRetry();
        renderAccountUI();
        if (throwOnError) throw e;
      }
    }

    function prepareItemForSync(item) {
      const data = { ...item, id: String(item.id) };
      const limits = { title: 2000, description: 10000, note: 50000, project: 500, folderId: 128, projectName: 500 };
      Object.entries(limits).forEach(([key, limit]) => {
        if (data[key] != null) data[key] = String(data[key]).slice(0, limit);
      });
      for (const key of ['autoTags', 'suggestedTags']) {
        if (data[key] !== undefined) {
          data[key] = Array.isArray(data[key])
            ? [...new Set(data[key].filter(tag => typeof tag === 'string').map(tag => tag.slice(0, 100)))].slice(0, 64)
            : [];
        }
      }
      // Extracted page caches and screenshots belong in the search index, not
      // in the bookmark sync row. Old imports may contain them and exceed the
      // Worker's per-item safety limit even though the bookmark itself is valid.
      for (const key of ['bodyText', 'extractedText', 'html', 'content', 'screenshot', 'thumbnail', 'imageData', 'previewImage']) {
        if (typeof data[key] === 'string' && data[key].length > 8000) delete data[key];
      }
      return data;
    }

    function mergeUniqueStrings(...groups) {
      const seen = new Set();
      const result = [];
      for (const value of groups.flat()) {
        const clean = String(value || '').trim();
        const key = clean.toLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        result.push(clean);
      }
      return result;
    }

    function updateLibraryIntelStatus(message) {
      const status = document.getElementById('libraryIntelStatus');
      const button = document.getElementById('enrichLibraryBtn');
      if (!status || !button) return;
      button.disabled = enrichmentRunning || !cloud.mode || privacyMode;
      button.textContent = enrichmentRunning ? 'Enriching…' : 'Enrich library';
      if (message) { status.textContent = message; return; }
      if (!cloud.mode) status.textContent = 'Sign in to enable cloud intelligence';
      else if (privacyMode) status.textContent = 'Turn off Privacy mode to fetch page content';
      else status.textContent = 'Ready for full-text and semantic indexing';
    }

    async function requestItemEnrichment(item, quiet = false) {
      if (!item || !cloud.mode || privacyMode) return null;
      await cloudPushNow();
      const response = await fetch('/api/library/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ itemId: String(item.id) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (!quiet) showToast(data.error === 'daily_ai_limit' ? 'Daily intelligence limit reached. Try again tomorrow.' : 'Could not enrich this page.');
        throw new Error(data.error || 'Enrichment failed (' + response.status + ')');
      }
      const enrichment = data.enrichment || {};
      const live = items.find(candidate => sameId(candidate.id, item.id));
      if (!live) return data;
      if (enrichment.title) live.title = enrichment.title;
      if (enrichment.description) live.description = enrichment.description;
      if (enrichment.contentText) live.contentText = enrichment.contentText;
      if (enrichment.contentHash) live.contentHash = enrichment.contentHash;
      if (enrichment.normalizedUrl) live.normalizedUrl = enrichment.normalizedUrl;
      if (enrichment.category) live.category = enrichment.category;
      if (enrichment.language) live.language = enrichment.language;
      if (enrichment.enrichedAt) live.enrichedAt = enrichment.enrichedAt;
      if (enrichment.enrichmentStatus) live.enrichmentStatus = enrichment.enrichmentStatus;
      live.semanticReady = !!enrichment.semanticReady;
      live.autoTags = mergeUniqueStrings(enrichment.autoTags || [], live.autoTags || []).slice(0, 10);
      live.suggestedTags = mergeUniqueStrings(enrichment.suggestedTags || [], live.suggestedTags || []).slice(0, 10);
      dbPut(live);
      return data;
    }

    function queueItemEnrichment(item) {
      setTimeout(() => {
        if (!cloud.mode || privacyMode) return;
        requestItemEnrichment(item, true).then(() => refresh()).catch(error => console.warn('Background enrichment skipped', error));
      }, 1400);
    }

    let importedIntelligenceTimer = null;
    function scheduleImportedIntelligence(importedCount) {
      if (!importedCount || !cloud.mode || privacyMode) return;
      clearTimeout(importedIntelligenceTimer);
      importedIntelligenceTimer = setTimeout(async () => {
        try {
          updateLibraryIntelStatus(`Indexing ${importedCount} imported link${importedCount === 1 ? '' : 's'}…`);
          await cloudPushNow({ throwOnError: true });
          await enrichPendingLibrary(Math.min(250, Math.max(importedCount, 20)), true);
          showToast(`Smart processing finished for imported links.`);
        } catch (error) {
          console.warn('Imported library indexing paused', error);
          updateLibraryIntelStatus('Some imported pages still need indexing — tap Enrich library to continue');
        }
      }, 900);
    }

    async function enrichPendingLibrary(maxItems = 250, quiet = false) {
      if (enrichmentRunning || !cloud.mode || privacyMode) return 0;
      enrichmentRunning = true;
      updateLibraryIntelStatus('Preparing your library…');
      let processed = 0;
      const attempted = new Set();
      try {
        await cloudPushNow();
        while (processed < maxItems) {
          const response = await fetch('/api/library/status?limit=' + Math.min(maxItems, 250), { headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('Library status failed (' + response.status + ')');
          const data = await response.json();
          const next = (data.items || []).find(row => !attempted.has(String(row.item_id)));
          if (!next) {
            updateLibraryIntelStatus(data.pending ? `${data.pending} pages need a later retry` : 'Library intelligence is up to date');
            break;
          }
          const id = String(next.item_id);
          attempted.add(id);
          const item = items.find(candidate => sameId(candidate.id, id));
          if (!item) continue;
          updateLibraryIntelStatus(`Processing ${processed + 1} of up to ${Math.min(maxItems, Math.max(Number(data.pending) || 1, 1))}…`);
          try { await requestItemEnrichment(item, true); }
          catch (error) { console.warn('Page enrichment failed', id, error); }
          processed++;
        }
        if (processed) {
          refresh();
          await cloudPushNow();
          if (!quiet) showToast(`Enriched ${processed} page${processed === 1 ? '' : 's'}.`);
        }
        return processed;
      } finally {
        enrichmentRunning = false;
        updateLibraryIntelStatus();
      }
    }

    async function enrichLibraryAll() {
      if (!cloud.mode) { openLogin(); showToast('Sign in to build your private library index.'); return; }
      if (privacyMode) { showToast('Turn off Privacy mode to fetch page content.'); return; }
      try { await enrichPendingLibrary(250, false); }
      catch (error) { console.error('Library enrichment failed', error); showToast('Library enrichment paused. You can retry safely.'); }
    }

    function openLibraryAsk(initialQuestion = '') {
      if (!cloud.mode) { openLogin(); showToast('Sign in to ask your private library.'); return; }
      const overlay = document.getElementById('libraryAskOverlay');
      if (!overlay) return;
      overlay.classList.add('show');
      const input = document.getElementById('libraryAskInput');
      if (initialQuestion) input.value = initialQuestion;
      document.getElementById('libraryAskStatus').textContent = items.length
        ? `${items.length} saved link${items.length === 1 ? '' : 's'} available · ⌘/Ctrl + Enter to ask`
        : 'Your library is empty — save or import links first';
      setTimeout(() => input.focus(), 60);
    }

    function closeLibraryAsk() {
      const overlay = document.getElementById('libraryAskOverlay');
      if (overlay) overlay.classList.remove('show');
    }

    async function submitLibraryAsk() {
      const input = document.getElementById('libraryAskInput');
      const button = document.getElementById('libraryAskBtn');
      const status = document.getElementById('libraryAskStatus');
      const result = document.getElementById('libraryAskResult');
      const question = String(input && input.value || '').trim();
      if (question.length < 3 || !cloud.mode) return;
      if (isOrganizationRequest(question)) {
        await previewOrganizeFromQuery(question);
        return;
      }
      button.disabled = true;
      status.textContent = 'Searching and reading your library…';
      result.innerHTML = '';
      try {
        // Make newly imported/saved links searchable before asking. This avoids
        // the common race where the UI shows a link that D1 has not indexed yet.
        await cloudPushNow();
        const response = await fetch('/api/library/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ question })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Ask failed (' + response.status + ')');
        const answer = document.createElement('div');
        answer.className = 'library-ask-answer';
        answer.textContent = data.answer || 'No answer was found in your library.';
        result.appendChild(answer);
        if (Array.isArray(data.followUps) && data.followUps.length) {
          const followups = document.createElement('div');
          followups.className = 'library-ask-followups';
          const label = document.createElement('span');
          label.className = 'library-ask-followups-label';
          label.textContent = 'Continue';
          followups.appendChild(label);
          data.followUps.slice(0, 3).forEach(suggestion => {
            const followup = document.createElement('button');
            followup.type = 'button';
            followup.className = 'library-ask-followup';
            followup.textContent = suggestion;
            followup.addEventListener('click', () => { input.value = suggestion; submitLibraryAsk(); });
            followups.appendChild(followup);
          });
          result.appendChild(followups);
        }
        const answerSources = Array.isArray(data.sources) ? data.sources.filter(source => {
          try { return ['http:', 'https:'].includes(new URL(source && source.url).protocol); }
          catch (_) { return false; }
        }).slice(0, 3) : [];
        if (!data.noResults && answerSources.length) {
          const links = document.createElement('div');
          links.className = 'library-answer-sources';
          answerSources.forEach(source => {
            const link = document.createElement('a');
            link.className = 'library-answer-source';
            // Assigning to the .href DOM property: use safeHttpUrl (clean URL),
            // not safeUrl (which HTML-entity-escapes and would corrupt query
            // strings containing &).
            link.href = safeHttpUrl(source.url) || '#';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute('aria-label', `Open source: ${source.title || source.url}`);
            const label = document.createElement('span');
            label.textContent = `↗ ${source.title || new URL(source.url).hostname}`;
            link.appendChild(label);
            links.appendChild(link);
          });
          result.appendChild(links);
        }
        if (data.noResults) {
          status.textContent = data.pending
            ? `${data.indexed || 0} indexed · ${data.pending} still processing`
            : `${data.indexed || 0} indexed links · try fewer or more specific words`;
          if (data.pending && !privacyMode) enrichPendingLibrary(Math.min(Number(data.pending) || 20, 50), true).catch(() => {});
        } else {
          status.textContent = data.semantic ? 'Answer grounded in semantic + full-text search' : 'Answer grounded in full-text search';
        }
        lastLibraryAskQuestion = question;
      } catch (error) {
        const dailyLimit = String(error.message || '').includes('daily_ai_limit');
        const unavailable = String(error.message || '').includes('ai_unavailable');
        status.textContent = dailyLimit ? 'Daily Ask limit reached — try again tomorrow' : (unavailable ? 'Ask AI is temporarily unavailable' : 'Could not answer right now');
        const message = document.createElement('div');
        message.className = 'library-ask-error';
        message.textContent = dailyLimit ? 'The daily AI allowance has been used.' : (unavailable ? 'Keyword and semantic search still work while Ask is unavailable.' : 'Your library is safe. Please retry in a moment.');
        result.appendChild(message);
      } finally { button.disabled = false; }
    }

    function isOrganizationRequest(question) {
      return /(?:предложи|создай|покажи).{0,30}(?:структур|папк|организац)|(?:organize|suggest|create).{0,30}(?:structure|folders?|collections?)/iu.test(question);
    }

    function organizationTopic(question) {
      return String(question || '')
        .replace(/(?:найди|покажи)\s+(?:все\s+)?(?:мои\s+)?(?:ссылки|материалы)\s+(?:про|о|об)\s+/iu, '')
        .replace(/(?:и\s+)?(?:предложи|создай|покажи).{0,40}(?:структур\p{L}*|папк\p{L}*|организац\p{L}*)[.!?]?/iu, '')
        .replace(/(?:find|show)\s+(?:all\s+)?(?:my\s+)?(?:links?|pages?|materials?)\s+(?:about|on)\s+/iu, '')
        .replace(/(?:and\s+)?(?:organize|suggest|create).{0,40}(?:structure|folders?|collections?)[.!?]?/iu, '')
        .trim() || String(question || '').trim();
    }

    async function previewOrganizeFromQuery(question) {
      const button = document.getElementById('libraryAskBtn');
      const status = document.getElementById('libraryAskStatus');
      const topic = organizationTopic(question);
      button.disabled = true;
      status.textContent = 'Finding links and building a safe preview…';
      try {
        await cloudPushNow();
        const response = await fetch('/api/library/search?q=' + encodeURIComponent(topic) + '&mode=hybrid&limit=30', {
          headers: { Accept: 'application/json' }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Search failed');
        const matched = new Map((data.results || []).map(result => [String(result.itemId), result]));
        organizeResults = items.filter(item => matched.has(String(item.id)) && !item.archived).map(item => {
          const result = matched.get(String(item.id)) || {};
          const target = inferProjectName(item.autoTags, item.domain) || result.category || folderName(item.folderId || item.project);
          return { id: item.id, title: item.title || item.url, from: folderName(item.folderId || item.project), to: target };
        }).filter(result => result.to && result.to !== result.from);
        closeLibraryAsk();
        renderOrganizeList();
        const counts = new Map();
        organizeResults.forEach(result => counts.set(result.to, (counts.get(result.to) || 0) + 1));
        const summary = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([folder, count]) => `${folder} — ${count}`).join(' · ');
        document.getElementById('organizeStatus').textContent = organizeResults.length
          ? `Found ${matched.size} links. Suggested organization: ${summary}. Review every move before applying.`
          : `Found ${matched.size} links, but no safer folder changes are suggested.`;
        document.getElementById('organizeFoot').style.display = organizeResults.length ? 'flex' : 'none';
        document.getElementById('organizeOverlay').classList.add('show');
      } catch (error) {
        status.textContent = 'Could not build the organization preview right now.';
      } finally { button.disabled = false; }
    }

    function beginLogin(provider) { location.href = '/api/auth/' + provider + '/login'; }
    function openLogoutOptions() {
      const overlay = document.getElementById('logoutOverlay');
      if (!overlay) return;
      document.getElementById('logoutStatus').textContent = '';
      overlay.classList.add('show');
      setTimeout(() => overlay.querySelector('.logout-option')?.focus(), 40);
    }
    function closeLogoutOptions() {
      document.getElementById('logoutOverlay')?.classList.remove('show');
    }
    async function deleteLocalLibraryDatabase() {
      cloud.suspend = true;
      clearTimeout(cloud.timer);
      clearTimeout(importedIntelligenceTimer);
      await _idbWriteQueue;
      if (_db) { _db.close(); _db = null; }
      await new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase(DB_NAME);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('Could not clear browser storage'));
        request.onblocked = () => reject(new Error('Browser storage is busy. Close other saveto.me tabs and retry.'));
      });
    }
    async function cloudLogout() {
      const status = document.getElementById('logoutStatus');
      closeLogoutOptions();
      const confirmed = await uiConfirm({
        title: 'Sign out completely?',
        message: 'Your changes will be synced first. Then the private local copy will be removed from this device. Your cloud library remains safely in your account.',
        okLabel: 'Sync and sign out',
        danger: false
      });
      if (!confirmed) return;
      document.getElementById('logoutOverlay')?.classList.add('show');
      if (status) status.textContent = 'Syncing before sign out…';
      try {
        await _idbWriteQueue;
        await cloudPushNow({ throwOnError: true });
        if (cloud.dirty.size || cloud.deletes.size || cloud.settingsDirty) {
          throw new Error('Some local changes could not be synced. Local data was not removed.');
        }
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) throw new Error('Sign out failed (' + response.status + ')');
        clearAccountPreview();
        await deleteLocalLibraryDatabase();
        location.replace('/app');
      } catch (error) {
        console.error('Sign out failed', error);
        if (status) status.textContent = error.message || 'Could not sign out safely.';
        showToast(error.message || 'Could not sign out safely.');
      }
    }
    async function deleteAccountPermanently() {
      const button = document.getElementById('deleteAccountBtn');
      const status = document.getElementById('deleteAccountStatus');
      // Keep the destructive workflow single-flight. A second click while the
      // typed confirmation or server request is open must never create a
      // second delete request.
      if (button?.disabled) return;
      if (!cloud.mode || !cloud.user) {
        showToast('Sign in before deleting an account.');
        openLogin();
        return;
      }
      button.disabled = true;
      let deletionSucceeded = false;
      try {
        const typed = await uiPrompt({
          title: 'Delete account permanently',
          message: 'Type DELETE MY ACCOUNT to confirm permanent deletion of all cloud and local data.',
          value: '', okLabel: 'Continue', icon: 'trash'
        });
        if (typed === null) return;
        if (typed.trim() !== 'DELETE MY ACCOUNT') {
          showToast('Confirmation did not match. Nothing was deleted.');
          return;
        }
        const confirmed = await uiConfirm({
          title: 'This cannot be undone',
          message: 'Your account, bookmarks, folders, smart index, Ask history, settings, and local browser copy will be permanently removed.',
          okLabel: 'Delete forever', danger: true
        });
        if (!confirmed) return;
        status.textContent = 'Deleting account and private library…';
        const response = await fetch('/api/account', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ confirmation: 'DELETE MY ACCOUNT' })
        });
        if (!response.ok) {
          let data = null; try { data = await response.json(); } catch (e) {}
          throw new Error(data?.error || `Account deletion failed (${response.status})`);
        }
        clearAccountPreview();
        localStorage.setItem('savemePendingAccountPurge', '1');
        await deleteLocalLibraryDatabase();
        localStorage.removeItem('savemePendingAccountPurge');
        deletionSucceeded = true;
        location.replace('/');
      } catch (error) {
        console.error('Account deletion failed', error);
        status.textContent = error.message || 'Could not delete the account safely.';
        showToast(status.textContent);
      } finally {
        // The successful branch redirects immediately. Every cancelled or
        // failed branch restores the control so the user remains in charge.
        if (!deletionSucceeded) button.disabled = false;
      }
    }
    function openLogin()  { const o = document.getElementById('loginOverlay'); if (o) o.classList.add('show'); }
    function closeLogin() {
      const o = document.getElementById('loginOverlay'); if (o) o.classList.remove('show');
      document.getElementById('btnMenu')?.setAttribute('aria-expanded', 'false');
    }

    function openOnboarding() {
      const overlay = document.getElementById('onboardingOverlay');
      if (!overlay) return;
      overlay.classList.add('show');
      setTimeout(() => overlay.querySelector('.onboarding-import')?.focus(), 60);
    }
    function closeOnboarding() {
      document.getElementById('onboardingOverlay')?.classList.remove('show');
    }
    function acceptOnboardingImport() {
      closeOnboarding();
      openSettings('data');
      setTimeout(() => document.querySelector('button[onclick*="importFile"]')?.focus(), 80);
    }

    function renderAccountUI() {
      const row = document.querySelector('.profile-row');
      if (!row) return;
      const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const visibleUser = cloud.user || accountPreview;
      if (visibleUser) {
        const u = visibleUser;
        const initials = (u.name || u.email || 'U').trim().slice(0, 1).toUpperCase();
        const avatarUrl = safeUrl(u.avatar || '');
        const av = u.avatar && avatarUrl !== '#'
          ? `<img class="profile-av" src="${avatarUrl}" alt="" referrerpolicy="no-referrer">`
          : `<div class="profile-av">${esc(initials)}</div>`;
        const subtitle = cloud.user
          ? (cloud.lastError ? 'Sync paused' : (u.email || 'Synced to cloud'))
          : (accountPreviewState === 'offline' ? 'Offline — sign-in not confirmed' : 'Checking sign-in…');
        const accountControl = cloud.user
          ? `<button class="profile-logout" title="Sign out" aria-label="Sign out" onclick="openLogoutOptions()">` +
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`
          : `<span class="profile-checking" role="status" aria-label="Checking sign-in">` +
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg></span>`;
        row.innerHTML = av +
          `<div class="profile-text"><span class="profile-name">${esc(u.name || 'Account')}</span>` +
          (cloud.user && cloud.lastError
            ? `<button class="profile-sub profile-sync-retry" type="button" onclick="retryCloudSync()" title="${esc(cloud.lastError)}">${esc(subtitle)} · Retry</button>`
            : `<span class="profile-sub">${esc(subtitle)}</span>`) + `</div>` + accountControl;
      } else {
        row.innerHTML =
          `<div class="profile-av">?</div>` +
          `<div class="profile-text"><span class="profile-name">Not signed in</span>` +
          `<span class="profile-sub">Local only</span></div>` +
          `<button class="profile-login" onclick="openLogin()">Sign in</button>`;
      }
      updateSearchModeButton();
      updateLibraryIntelStatus();
      const deleteButton = document.getElementById('deleteAccountBtn');
      const deleteStatus = document.getElementById('deleteAccountStatus');
      if (deleteButton) deleteButton.disabled = !cloud.user;
      if (deleteStatus) deleteStatus.textContent = cloud.user ? 'Permanent and irreversible' : 'Sign in to delete an account';
    }

    renderAccountUI();
    updateSearchModeButton();
    initDropImport();
    const pendingAccountPurge = localStorage.getItem('savemePendingAccountPurge') === '1';
    (pendingAccountPurge ? deleteLocalLibraryDatabase().then(() => localStorage.removeItem('savemePendingAccountPurge')) : Promise.resolve())
    .then(() => initStore()).then(async () => {
      await cloudInit();
      if (extensionCaptureShouldClose) {
        await _idbWriteQueue;
        if (cloud.mode) await cloudPushNow();
        showToast(cloud.mode ? 'Saved and synced' : 'Saved in this browser');
        setTimeout(() => window.close(), 500);
      }
      const params = new URLSearchParams(location.search);
      const localPreview = location.hostname === '127.0.0.1' || location.hostname === 'localhost';
      if (params.get('onboarding') === '1' && (cloud.user || localPreview)) {
        openOnboarding();
        params.delete('onboarding');
        const next = location.pathname + (params.toString() ? '?' + params.toString() : '') + location.hash;
        history.replaceState(null, '', next);
      }
    });

    // --- Drag/drop handlers extracted from inline attributes (need live module state) ---
    function rootDragOver(e) {
      if (dragKind === 'project') { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
    }
    function rootDrop(e) {
      e.preventDefault();
      e.currentTarget.classList.remove('drag-over');
      if (dragKind === 'project' && draggedName) unnestProject(draggedName);
    }
    function sfChipDragOver(e) {
      if (dragKind === 'card') { e.preventDefault(); e.currentTarget.classList.add('sf-drop'); }
    }
    function sfChipDrop(e, el, name) {
      e.preventDefault();
      el.classList.remove('sf-drop');
      if (dragKind === 'card' && draggedItemId) {
        const it = items.find(i => sameId(i.id, draggedItemId));
        if (it) { it.project = name; it.folderId = name; it.projectName = folderName(name); dbPut(it); refresh(); }
      }
    }

    // --- window bridge: expose functions used by inline HTML on* handlers ---
    // app.js is an ES module (own scope); inline handlers run in global scope,
    // so every handler referenced from markup or generated template strings must
    // be published on window. Keep this list in sync with inline on* attributes.
    Object.assign(window, {
      addNewProject, addSubfolder, addTagToItem, applyOrganize, archiveHealthSelected,
      askCancel, askOk, beginLogin, clearFolderCustomize, clearMainSearch, clearRecentWindow,
      acceptOnboardingImport,
      closeFolderCustomize, closeHeaderMenu, closeHealth, closeLogin, closeLogoutOptions, closeNav, closeOnboarding, closeOrganize, closeSaveLink,
      closeLibraryAsk, closeSettings, closeShortcuts, closeTagsModal, closeCmdk, cloudLogout, cmdkHover, cmdkKey, cmdkRun,
      clearTags, confirmReclassify, confirmSuggested, deleteAccountPermanently, deleteItem, deleteProject,
      dismissSuggested, exportHTML, exportJSON, filterProject, filterTag,
      focusLibrarySearch, handleImportFile, handleInput, handleNoteKey, markOpened, navBack, navForward, onSettingsTabKey,
      enrichLibraryAll, onTagsSearch, openFolderCustomize, openHealth, openLibraryAsk, openLogin, openHeaderAccountAction, openLogoutOptions, openNav, openSettings, openOnboarding, openSaveLink, openRelatedLinks, pickSort, removeHealthSelected, removeTag, showSettingsDirectory,
      removeAllBrokenHealth, renameProject, renderCmdk, rootDragOver, rootDrop, runHealthCheck, runSmartSearchAction, setFolderColor,
      setFolderIcon, setPrivacyMode, setRecentWindow, setSettingsCategory, setTagMode, setTheme, setView, sfChipDragOver, sfChipDrop, submitSaveLink,
      showAll, showPinned, showRecent, toggleCollapse, toggleFinderFolder, toggleHeaderMenu, toggleHealthSelectAll, toggleRecentShowAll,
      toggleNav, toggleOrganizeSelectAll, togglePin, togglePriority, toggleSection, toggleSidebar,
      submitLibraryAsk, toggleSearchMode, toggleSortMenu, updateNote, unnestProject, navigateFolder, handleFinderKey, retryCloudSync, dbPut, refresh, markSearchNotRelevant, markSearchUseful
    });
    // Read-only snapshot used by diagnostics without exposing mutable task
    // internals to callers.
    window.getHealthTaskState = () => ({ ...healthTask, results: healthResults.length });
