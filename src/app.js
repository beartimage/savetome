import './styles.css';
import { htmlAttr, jsAttr, esc, safeUrl, safeColor, normalizeUrl, itemTimestamp, timeAgo, titleCase } from './util.js';
import { recordTagOverride, hostMatchesPattern, normalizeTag, prettifyTitle, generateLinkMetadata, getTagColorClass } from './classifier.js';

    let currentLayout = 'list';
    let currentDetailMode = 'compact';
    let activeFilter = null;        // project filter
    let activeTags = [];            // tag filter — multi-select (composes with project)
    let tagMode = 'or';             // 'or' = match ANY tag, 'and' = match ALL
    let searchQuery = '';
    let currentSort = 'newest';
    let draggedItemId = null;
    let dragKind = null;            // 'card' | 'project' | 'tag' — what is being dragged
    let draggedName = null;         // project/tag name being dragged
    let projectParent = {};         // child project name -> parent name (sub-folders)
    let projectCollapsed = new Set();// collapsed parent projects
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
      const el = document.querySelector(`.link-item[data-id="${id}"]`);
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }

    let customProjects = ["BeArt UI Redesign", "Dev Tools", "General"];
    // Manually-created projects are "priority" (starred, sorted first). Auto-created
    // ones (inferred from a link's topic, or imported folders) use the plain folder icon.
    // "General" is the neutral fallback bucket, not a starred/manual project.
    let priorityProjects = new Set(["BeArt UI Redesign", "Dev Tools"]);

    let items = [
      { id: 1, url: "https://dribbble.com/shots/26940926-Bloggo", title: "Bloggo — Dashboard for SaaS AI Blog Automation Platform", domain: "dribbble.com", description: "Bloggo helps creators stay in control of their content workflow with automated AI blogging pipelines and sleek card UI.", autoTags: ["Design", "SaaS", "AI"], note: "Primary clean design reference for saveto.me UI", project: "BeArt UI Redesign" },
      { id: 2, url: "https://supabase.com", title: "Supabase | The Open Source Firebase Alternative", domain: "supabase.com", description: "Build production-ready apps with Postgres database, Authentication, Instant APIs, Realtime subscriptions, and Storage.", autoTags: ["Database", "Postgres", "Backend"], note: "Use for multi-device cloud database sync", project: "Dev Tools" },
      { id: 3, url: "https://github.com", title: "GitHub: Let's build from here", domain: "github.com", description: "Complete developer platform to build, scale, and deliver secure software with GitHub Pages hosting.", autoTags: ["Dev", "Code", "Hosting"], note: "Deploy static HTML directly to GitHub Pages", project: "Dev Tools" },
      { id: 4, url: "https://stackoverflow.com/questions/tagged/css-grid", title: "Newest 'css-grid' Questions — Stack Overflow", domain: "stackoverflow.com", description: "Community Q&A for programmers, covering CSS grid, masonry layouts, and front-end troubleshooting.", autoTags: ["Dev", "CSS", "Q&A"], note: "", project: "Dev Tools" },
      { id: 5, url: "https://developer.mozilla.org/en-US/docs/Web/CSS/columns", title: "columns — CSS: Cascading Style Sheets | MDN", domain: "developer.mozilla.org", description: "The columns CSS shorthand property sets the number of columns to use when drawing an element's content, plus the width of those columns.", autoTags: ["Docs", "CSS", "Reference"], note: "Masonry column-fill reference", project: "Dev Tools" },
      { id: 6, url: "https://www.figma.com/community", title: "Figma Community — Explore files and plugins", domain: "figma.com", description: "Browse thousands of free design files, UI kits, and plugins shared by the Figma community.", autoTags: ["Design", "UI", "Tools"], note: "Grab a dashboard UI kit", project: "BeArt UI Redesign" },
      { id: 7, url: "https://www.notion.so/product", title: "Notion — Your connected workspace for wiki, docs & projects", domain: "notion.so", description: "One workspace for notes, docs, wikis, and project management with flexible databases.", autoTags: ["Productivity", "Notes", "SaaS"], note: "", project: "General" },
      { id: 8, url: "https://news.ycombinator.com", title: "Hacker News", domain: "news.ycombinator.com", description: "Social news website focusing on computer science, startups, and entrepreneurship.", autoTags: ["News", "Tech", "Startups"], note: "Morning reading", project: "General" },
      { id: 9, url: "https://en.wikipedia.org/wiki/Masonry_(design)", title: "Masonry (design) — Wikipedia", domain: "wikipedia.org", description: "The free encyclopedia article on masonry grid layouts in web and graphic design.", autoTags: ["Reference", "Design"], note: "", project: "BeArt UI Redesign" },
      { id: 10, url: "https://www.youtube.com/watch?v=jV8B24rSN5o", title: "CSS Grid Layout Crash Course — YouTube", domain: "youtube.com", description: "Video tutorial walking through CSS grid fundamentals and responsive layouts.", autoTags: ["Video", "Tutorial", "CSS"], note: "Watch later", project: "Dev Tools" },
      { id: 11, url: "https://tailwindcss.com/docs", title: "Documentation — Tailwind CSS", domain: "tailwindcss.com", description: "Utility-first CSS framework documentation for rapidly building custom user interfaces.", autoTags: ["Docs", "CSS", "Framework"], note: "", project: "Dev Tools" },
      { id: 12, url: "https://vercel.com", title: "Vercel: Build and deploy the best web experiences", domain: "vercel.com", description: "Frontend cloud platform for deploying Next.js and static sites with instant global CDN.", autoTags: ["Hosting", "Deploy", "Cloud"], note: "Alt to Cloudflare Pages", project: "Dev Tools" },
      { id: 13, url: "https://www.cloudflare.com/developer-platform/pages/", title: "Cloudflare Pages — JAMstack platform", domain: "cloudflare.com", description: "Deploy static and full-stack apps to Cloudflare's global network with zero config.", autoTags: ["Hosting", "Deploy", "Cloud"], note: "Deploy target for saveto.me", project: "Dev Tools" },
      { id: 14, url: "https://fonts.google.com/specimen/Inter", title: "Inter — Google Fonts", domain: "fonts.google.com", description: "A typeface carefully crafted and designed for computer screens, used across the saveto.me UI.", autoTags: ["Design", "Typography", "Fonts"], note: "App font", project: "BeArt UI Redesign" },
      { id: 15, url: "https://feathericons.com", title: "Feather — Simply beautiful open source icons", domain: "feathericons.com", description: "A collection of simply beautiful open source icons; each icon is a 24x24 grid SVG.", autoTags: ["Design", "Icons", "SVG"], note: "Icon set used in the sidebar", project: "BeArt UI Redesign" },
      { id: 16, url: "https://coolors.co", title: "Coolors — The super fast color palette generator", domain: "coolors.co", description: "Generate or browse thousands of beautiful color palettes for design projects in seconds.", autoTags: ["Design", "Color", "Tools"], note: "", project: "BeArt UI Redesign" },
      { id: 17, url: "https://unsplash.com", title: "Unsplash — Beautiful Free Images & Pictures", domain: "unsplash.com", description: "The internet's source of freely-usable images, powered by creators everywhere.", autoTags: ["Images", "Design", "Free"], note: "", project: "General" },
      { id: 18, url: "https://www.behance.net", title: "Behance — Best of the Creative Web", domain: "behance.net", description: "Showcase and discover creative work across design, illustration, photography, and more.", autoTags: ["Design", "Portfolio", "Inspiration"], note: "", project: "BeArt UI Redesign" },
      { id: 19, url: "https://developer.apple.com/design/human-interface-guidelines", title: "Human Interface Guidelines — Apple Developer", domain: "developer.apple.com", description: "Best practices and guidance for designing great experiences across Apple platforms.", autoTags: ["Design", "Docs", "Guidelines"], note: "", project: "BeArt UI Redesign" },
      { id: 20, url: "https://react.dev", title: "React — The library for web and native user interfaces", domain: "react.dev", description: "Official React documentation covering components, hooks, and modern patterns.", autoTags: ["Dev", "JavaScript", "Framework"], note: "", project: "Dev Tools" },
      { id: 21, url: "https://nodejs.org/en/docs", title: "Node.js Documentation", domain: "nodejs.org", description: "JavaScript runtime built on Chrome's V8 engine; official API and guide documentation.", autoTags: ["Dev", "JavaScript", "Docs"], note: "", project: "Dev Tools" },
      { id: 22, url: "https://www.postgresql.org/docs/", title: "PostgreSQL: Documentation", domain: "postgresql.org", description: "The world's most advanced open source relational database — full manual and reference.", autoTags: ["Database", "Docs", "SQL"], note: "", project: "Dev Tools" },
      { id: 23, url: "https://caniuse.com/css-has", title: "Can I use — CSS :has() selector support", domain: "caniuse.com", description: "Browser support tables for modern web technologies including the CSS :has() selector.", autoTags: ["Dev", "CSS", "Reference"], note: "Checked :has() support for masonry", project: "Dev Tools" },
      { id: 24, url: "https://css-tricks.com/piecing-together-approaches-for-a-css-masonry-layout/", title: "Piecing Together Approaches for a CSS Masonry Layout", domain: "css-tricks.com", description: "A survey of techniques for building masonry layouts in CSS, from columns to grid.", autoTags: ["Dev", "CSS", "Article"], note: "", project: "BeArt UI Redesign" },
      { id: 25, url: "https://www.smashingmagazine.com/category/design", title: "Design Articles — Smashing Magazine", domain: "smashingmagazine.com", description: "In-depth articles on web design, UX, and front-end development for professionals.", autoTags: ["Design", "Article", "UX"], note: "", project: "BeArt UI Redesign" },
      { id: 26, url: "https://www.awwwards.com", title: "Awwwards — Website Awards — Best Web Design Trends", domain: "awwwards.com", description: "Recognizing the talent and effort of the best web designers, developers, and agencies.", autoTags: ["Design", "Inspiration", "Awards"], note: "", project: "BeArt UI Redesign" },
      { id: 27, url: "https://developer.chrome.com/docs/devtools", title: "Chrome DevTools — Chrome for Developers", domain: "developer.chrome.com", description: "Documentation for the suite of web developer tools built directly into Chrome.", autoTags: ["Dev", "Tools", "Docs"], note: "", project: "Dev Tools" },
      { id: 28, url: "https://web.dev/learn/css", title: "Learn CSS — web.dev", domain: "web.dev", description: "An evergreen CSS course and reference by the Google web developer relations team.", autoTags: ["Dev", "CSS", "Course"], note: "", project: "Dev Tools" },
      { id: 29, url: "https://www.google.com/search?q=on-device+text+classification", title: "on-device text classification — Google Search", domain: "google.com", description: "Search results exploring approaches to running text classification models locally.", autoTags: ["Search", "AI", "Research"], note: "Research for the tag classifier", project: "General" },
      { id: 30, url: "https://huggingface.co/models", title: "Models — Hugging Face", domain: "huggingface.co", description: "The AI community building the future — browse thousands of open ML models and datasets.", autoTags: ["AI", "ML", "Models"], note: "", project: "General" },
      { id: 31, url: "https://openai.com/blog", title: "Blog — OpenAI", domain: "openai.com", description: "Announcements and research updates from OpenAI on AI models and safety.", autoTags: ["AI", "News", "Research"], note: "", project: "General" },
      { id: 32, url: "https://www.anthropic.com/news", title: "News — Anthropic", domain: "anthropic.com", description: "Latest research, product, and policy news from Anthropic, makers of Claude.", autoTags: ["AI", "News", "Research"], note: "", project: "General" },
      { id: 33, url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API", title: "Web Storage API — MDN", domain: "developer.mozilla.org", description: "Mechanisms by which browsers store key/value pairs, including localStorage and sessionStorage.", autoTags: ["Docs", "JavaScript", "Reference"], note: "For adding localStorage persistence", project: "Dev Tools" },
      { id: 34, url: "https://www.reddit.com/r/webdev/", title: "r/webdev — Reddit", domain: "reddit.com", description: "A community dedicated to all things web development: design, dev, and everything in between.", autoTags: ["Community", "Dev", "Forum"], note: "", project: "General" },
      { id: 35, url: "https://medium.com/tag/frontend-development", title: "Frontend Development — Medium", domain: "medium.com", description: "Articles and stories tagged frontend development from writers across Medium.", autoTags: ["Article", "Dev", "Blog"], note: "", project: "General" },
      { id: 36, url: "https://www.producthunt.com", title: "Product Hunt — The best new products in tech", domain: "producthunt.com", description: "Discover the latest mobile apps, websites, and technology products that everyone's talking about.", autoTags: ["Tech", "Startups", "Products"], note: "", project: "General" },
      { id: 37, url: "https://linear.app", title: "Linear — Plan and build products", domain: "linear.app", description: "The issue tracking tool you'll enjoy using — streamlined project and roadmap planning.", autoTags: ["Productivity", "SaaS", "Tools"], note: "", project: "General" },
      { id: 38, url: "https://www.canva.com", title: "Canva: Visual Suite for Everyone", domain: "canva.com", description: "Design anything with easy drag-and-drop tools, templates, and a huge asset library.", autoTags: ["Design", "Tools", "Templates"], note: "", project: "BeArt UI Redesign" },
      { id: 39, url: "https://css-tricks.com/almanac/properties/c/column-fill/", title: "column-fill — CSS-Tricks Almanac", domain: "css-tricks.com", description: "Reference for the column-fill property controlling how content balances across columns.", autoTags: ["Dev", "CSS", "Reference"], note: "", project: "Dev Tools" },
      { id: 40, url: "https://www.pinterest.com/search/pins/?q=dashboard%20ui", title: "Dashboard UI — Pinterest", domain: "pinterest.com", description: "Explore a curated board of dashboard UI design ideas and layout inspiration.", autoTags: ["Design", "Inspiration", "UI"], note: "Masonry layout inspiration", project: "BeArt UI Redesign" },
      { id: 41, url: "https://www.typescriptlang.org/docs/", title: "TypeScript: Documentation", domain: "typescriptlang.org", description: "JavaScript with syntax for types — official handbook and reference documentation.", autoTags: ["Dev", "JavaScript", "Docs"], note: "", project: "Dev Tools" },
      { id: 42, url: "https://vitejs.dev", title: "Vite — Next Generation Frontend Tooling", domain: "vitejs.dev", description: "A build tool that aims to provide a faster and leaner development experience for modern web projects.", autoTags: ["Dev", "Tools", "Build"], note: "", project: "Dev Tools" },
      { id: 43, url: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog", title: "<dialog> — HTML: HyperText Markup Language | MDN", domain: "developer.mozilla.org", description: "The HTML dialog element represents a modal or non-modal dialog box or interactive component.", autoTags: ["Docs", "HTML", "Reference"], note: "", project: "Dev Tools" },
      { id: 44, url: "https://www.deque.com/axe/", title: "axe — Accessibility Testing Tools", domain: "deque.com", description: "Automated accessibility testing tools and libraries to catch WCAG issues early.", autoTags: ["Dev", "Accessibility", "Tools"], note: "", project: "Dev Tools" },
      { id: 45, url: "https://realfavicongenerator.net", title: "Favicon Generator for perfect icons on all browsers", domain: "realfavicongenerator.net", description: "Generate favicons and app icons for every platform from a single source image.", autoTags: ["Design", "Tools", "Icons"], note: "", project: "BeArt UI Redesign" },
      { id: 46, url: "https://squoosh.app", title: "Squoosh — Image compression made easy", domain: "squoosh.app", description: "Compress and compare images with different codecs, right in the browser.", autoTags: ["Tools", "Images", "Performance"], note: "", project: "General" },
      { id: 47, url: "https://excalidraw.com", title: "Excalidraw — Hand-drawn look diagrams", domain: "excalidraw.com", description: "Virtual whiteboard for sketching hand-drawn like diagrams, collaboratively.", autoTags: ["Tools", "Diagrams", "Design"], note: "Sketch the layout ideas", project: "General" },
      { id: 48, url: "https://www.wappalyzer.com", title: "Wappalyzer — Find out the technology stack of any website", domain: "wappalyzer.com", description: "Identify technologies on websites, from CMS to frameworks and analytics tools.", autoTags: ["Tools", "Dev", "Research"], note: "", project: "General" },
      { id: 49, url: "https://caniemail.com", title: "Can I email… — Support tables for HTML/CSS in emails", domain: "caniemail.com", description: "Support tables for HTML and CSS features across popular email clients.", autoTags: ["Dev", "Email", "Reference"], note: "", project: "Dev Tools" },
      { id: 50, url: "https://www.figma.com/blog/", title: "Blog — Figma", domain: "figma.com", description: "Product news, design stories, and tips from the Figma team.", autoTags: ["Design", "Blog", "News"], note: "", project: "BeArt UI Redesign" }
    ];

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
      if (view === 'pinterest') { currentLayout = 'grid'; currentDetailMode = 'detailed'; }
      else { view = 'lines'; currentLayout = 'list'; currentDetailMode = 'compact'; }
      document.getElementById('btnPinterest').classList.toggle('active', view === 'pinterest');
      document.getElementById('btnLines').classList.toggle('active', view === 'lines');
      updateContainerClasses();
    }

    // Collapse the sidebar to an icon rail; preference persists across reloads.
    function toggleSidebar() {
      // On mobile the sidebar is an off-canvas drawer — the chevron just closes it.
      if (isMobileNav()) { closeNav(); return; }
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      const btn = document.getElementById('sidebarToggle');
      if (btn) btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
      try { localStorage.setItem('savemeSidebarCollapsed', collapsed ? '1' : '0'); } catch (e) {}
    }

    // ---- Mobile navigation drawer ----
    function isMobileNav() { return window.matchMedia('(max-width: 820px)').matches; }
    function toggleNav() { document.body.classList.toggle('nav-open'); }
    function openNav() { document.body.classList.add('nav-open'); }
    function closeNav() { document.body.classList.remove('nav-open'); }
    // Tapping a folder/link/nav row inside the drawer closes it (but not accordion carets).
    document.addEventListener('DOMContentLoaded', () => {
      const aside = document.querySelector('aside');
      if (aside) aside.addEventListener('click', (e) => {
        if (!isMobileNav() || !document.body.classList.contains('nav-open')) return;
        if (e.target.closest('.proj-caret') || e.target.closest('.acc-header')) return;
        if (e.target.closest('.nav-item') || e.target.closest('.profile-login')) closeNav();
      });
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNav(); });

    // Workspace theme (persisted). Light / Dark / Green / Red / Black / Gold.
    const THEMES = ['light', 'dark', 'green', 'red', 'black', 'gold'];
    const THEME_CLASSES = ['dark', 'theme-green', 'theme-red', 'theme-black', 'theme-gold'];
    function setTheme(name) {
      if (!THEMES.includes(name)) name = 'light';
      const html = document.documentElement;
      html.classList.remove(...THEME_CLASSES);
      if (name === 'dark') html.classList.add('dark');
      else if (name === 'green') html.classList.add('theme-green');
      else if (name === 'red') html.classList.add('theme-red');
      else if (name === 'gold') html.classList.add('theme-gold');
      else if (name === 'black') html.classList.add('dark', 'theme-black'); // OLED layers on dark
      try { localStorage.setItem('savemeTheme', name); } catch (e) {}
      document.querySelectorAll('#themeSwatches .theme-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.theme === name);
      });
    }
    function currentTheme() {
      const c = document.documentElement.classList;
      if (c.contains('theme-black')) return 'black';
      if (c.contains('theme-green')) return 'green';
      if (c.contains('theme-red')) return 'red';
      if (c.contains('theme-gold')) return 'gold';
      if (c.contains('dark')) return 'dark';
      return 'light';
    }
    // Kept for the command palette shortcut — flips between light and dark.
    function toggleTheme() {
      const t = currentTheme();
      setTheme((t === 'light') ? 'dark' : 'light');
    }
    (function restoreTheme() {
      let saved = 'light';
      try { saved = localStorage.getItem('savemeTheme') || 'light'; } catch (e) {}
      setTheme(THEMES.includes(saved) ? saved : 'light');
    })();

    // Header overflow (kebab) menu — Health Checker / All Settings / Theme Switcher.
    function toggleHeaderMenu(event) {
      if (event) event.stopPropagation();
      const dd = document.getElementById('headerMenuDropdown');
      const btn = document.getElementById('btnMenu');
      if (!dd) return;
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
    }

    // Accordion: collapse/expand a sidebar section (favourites / projects / tags).
    function toggleSection(key) {
      const sec = document.querySelector(`.nav-section.acc[data-acc="${key}"]`);
      if (!sec) return;
      const collapsed = sec.classList.toggle('collapsed');
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
          if (sec) sec.classList.add('collapsed');
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

    // Ensure a project exists in the registry; `priority` marks it manually-created.
    function ensureProject(name, priority) {
      if (!name) return;
      if (!customProjects.includes(name)) customProjects.push(name);
      if (priority) priorityProjects.add(name);
      dbSaveProjects();
    }

    async function addNewProject() {
      const name = await uiPrompt({ title: 'New folder', message: 'Give your folder a name.', okLabel: 'Create', icon: 'folderPlus' });
      if (name && name.trim()) {
        const cleanName = name.trim();
        if (!customProjects.includes(cleanName)) {
          customProjects.push(cleanName);
          priorityProjects.add(cleanName);
          dbSaveProjects();
          refresh();
        }
      }
    }

    // Create a sub-folder (nested project) under an existing project.
    async function addSubfolder(e, parent) {
      e.stopPropagation();
      const name = await uiPrompt({ title: 'New sub-folder', message: `Create a folder inside "${parent}".`, okLabel: 'Create', icon: 'folderPlus' });
      if (!name || !name.trim()) return;
      const clean = name.trim();
      if (clean === parent) return;
      ensureProject(clean, false);
      nestProject(clean, parent);
    }

    async function renameProject(e, name) {
      e.stopPropagation();
      const nn = await uiPrompt({ title: 'Rename folder', value: name, okLabel: 'Rename', icon: 'edit' });
      if (!nn || !nn.trim()) return;
      const clean = nn.trim();
      if (clean === name) return;
      customProjects = [...new Set(customProjects.map(p => p === name ? clean : p).concat(clean))];
      if (priorityProjects.has(name)) { priorityProjects.delete(name); priorityProjects.add(clean); }
      // Re-parent: keep any children and this project's own parent link intact.
      for (const k in projectParent) { if (projectParent[k] === name) projectParent[k] = clean; }
      if (projectParent[name]) { projectParent[clean] = projectParent[name]; delete projectParent[name]; }
      if (projectCollapsed.has(name)) { projectCollapsed.delete(name); projectCollapsed.add(clean); }
      const moved = [];
      items.forEach(i => { if (i.project === name) { i.project = clean; moved.push(i); } });
      if (activeFilter === name) activeFilter = clean;
      dbPutMany(moved);
      dbSaveProjects();
      refresh();
    }

    async function deleteProject(e, name) {
      e.stopPropagation();
      const count = items.filter(i => i.project === name).length;
      const ok = await uiConfirm({
        title: `Delete "${name}"?`,
        message: count ? `Its ${count} link${count > 1 ? 's' : ''} will move to General. Any sub-folders move up a level.` : 'Any sub-folders move up a level.',
        okLabel: 'Delete', danger: true,
      });
      if (!ok) return;
      customProjects = customProjects.filter(p => p !== name);
      priorityProjects.delete(name);
      // Re-home children to this project's parent (or root), then drop it.
      const grand = projectParent[name] || null;
      for (const k in projectParent) { if (projectParent[k] === name) { if (grand) projectParent[k] = grand; else delete projectParent[k]; } }
      delete projectParent[name];
      projectCollapsed.delete(name);
      const moved = [];
      items.forEach(i => { if (i.project === name) { i.project = 'General'; moved.push(i); } });
      if (!customProjects.includes('General')) customProjects.push('General');
      if (activeFilter === name) activeFilter = null;
      dbPutMany(moved);
      dbSaveProjects();
      refresh();
      showToast(`Deleted folder "${name}"`);
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
    const FOLDER_COLORS = ['#6C5CE7','#F472B6','#818CF8','#34D399','#FB923C','#F87171','#38BDF8','#2DD4BF','#FBBF24','#A78BFA'];
    function projectIconHtml(name) {
      const m = projectMeta[name];
      if (m && m.icon && ICON_LIB[m.icon]) return ICON_LIB[m.icon];
      if (m && m.emoji) return `<span class="proj-emoji">${esc(m.emoji)}</span>`;   // legacy data
      if (priorityProjects.has(name)) return ICONS.star;
      // Sub-folders (nested under a parent project) get a distinct open-folder icon.
      if (projectParent[name]) return ICONS.subfolder;
      return ICONS.folder;
    }
    function projectColor(name) { const m = projectMeta[name]; return (m && m.color) ? safeColor(m.color) : null; }

    let _fcName = null;
    function openFolderCustomize(e, name) {
      if (e) e.stopPropagation();
      _fcName = name;
      document.getElementById('fcName').innerHTML = `Personalize <b>${htmlAttr(name)}</b> with an icon and color.`;
      const meta = projectMeta[name] || {};
      const eWrap = document.getElementById('fcEmoji');
      eWrap.innerHTML = FOLDER_ICON_KEYS.map(key =>
        `<button class="fc-icon${meta.icon === key ? ' on' : ''}" title="${key}" onclick="setFolderIcon('${key}')">${ICON_LIB[key]}</button>`
      ).join('');
      const cWrap = document.getElementById('fcColor');
      cWrap.innerHTML = FOLDER_COLORS.map(col =>
        `<button title="${col}" onclick="setFolderColor('${col}')" style="width:30px;height:30px;border-radius:50%;cursor:pointer;background:${col};border:3px solid ${meta.color === col ? 'var(--text-main)' : 'transparent'};box-shadow:0 1px 4px rgba(0,0,0,.2)"></button>`
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
      m.color = (m.color === col) ? null : col;
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
      return [...new Set([...customProjects, ...items.map(i => i.project)])].filter(Boolean);
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
      projectCollapsed.delete(parent);           // reveal the new child
      if (!customProjects.includes(child)) customProjects.push(child);
      dbSaveProjects();
      renderProjectsUI();
    }
    function unnestProject(child) {
      if (projectParent[child]) { delete projectParent[child]; dbSaveProjects(); renderProjectsUI(); }
    }
    function toggleCollapse(e, name) {
      e.stopPropagation();
      if (projectCollapsed.has(name)) projectCollapsed.delete(name); else projectCollapsed.add(name);
      dbSaveProjects();
      renderProjectsUI();
    }

    function makeProjectRow(projectName, depth, counts, all, showCaretCol) {
      const kids = childrenOf(projectName, all);
      const hasKids = kids.length > 0;
      const collapsed = projectCollapsed.has(projectName);
      const projectCount = rollupCount(projectName, counts, all);
      const isPriority = priorityProjects.has(projectName);
      const div = document.createElement('div');
      div.className = `nav-item ${activeFilter === projectName ? 'active' : ''}${isPriority ? ' priority' : ''}`;
      div.style.paddingLeft = (12 + depth * 14) + 'px';
      div.draggable = true;
      div.onclick = () => filterProject(projectName);

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
          const item = items.find(i => i.id === draggedItemId);
          if (item) { item.project = projectName; dbPut(item); refresh(); }
        } else if (dragKind === 'project' && draggedName) {
          nestProject(draggedName, projectName);
        }
      };

      const caret = hasKids
        ? `<button class="proj-caret${collapsed ? '' : ' open'}" title="${collapsed ? 'Expand' : 'Collapse'}" onclick="toggleCollapse(event, '${jsAttr(projectName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>`
        : (showCaretCol ? `<span class="proj-caret-spacer"></span>` : '');

      div.innerHTML = `
        ${caret}
        <span class="nav-icon"${projectColor(projectName) ? ` style="color:${projectColor(projectName)}"` : ''}>${projectIconHtml(projectName)}</span>
        <span class="nav-label">${esc(projectName)}</span>
        <span class="nav-right">
          <button class="proj-act" title="Customize" onclick="openFolderCustomize(event, '${jsAttr(projectName)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="16" cy="15" r="2.5"/><circle cx="8" cy="19" r="2"/></svg></button>
          <button class="proj-act${isPriority ? ' on' : ''}" title="${isPriority ? 'Remove favorite' : 'Mark as favorite'}" onclick="togglePriority(event, '${jsAttr(projectName)}')">${ICONS.star}</button>
          <span class="badge">${projectCount}</span>
        </span>
      `;
      return div;
    }

    function renderSidebarProjects() {
      const projectContainer = document.getElementById('project-list');
      projectContainer.innerHTML = '';

      // One O(N) pass for all counts — never O(projects × links).
      const counts = new Map();
      for (const i of items) counts.set(i.project, (counts.get(i.project) || 0) + 1);

      const all = allKnownProjects();

      // Search mode: flat list of ALL matches (so sub-folders are findable here).
      if (projectQuery) {
        const matches = all.filter(p => p.toLowerCase().includes(projectQuery))
          .sort((a, b) => (priorityProjects.has(b) - priorityProjects.has(a)) ||
            (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b));
        if (!matches.length) { projectContainer.innerHTML = '<div class="tag-empty">No folders match</div>'; return; }
        matches.forEach(p => projectContainer.appendChild(makeProjectRow(p, 0, counts, all, false)));
        return;
      }

      // Tree: top-level projects with their sub-folders nested beneath, indented
      // with a caret to collapse/expand (state persists in projectCollapsed).
      const roots = all.filter(p => !projectParent[p] || !all.includes(projectParent[p]));
      roots.sort((a, b) => (priorityProjects.has(b) - priorityProjects.has(a)) ||
        (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b));

      if (!roots.length) { projectContainer.innerHTML = '<div class="tag-empty">No folders yet</div>'; return; }

      // Reserve the caret column only if some project actually has sub-folders,
      // so leaf rows stay aligned under their siblings.
      const anyNested = all.some(p => projectParent[p] && all.includes(projectParent[p]));

      const appendTree = (name, depth) => {
        projectContainer.appendChild(makeProjectRow(name, depth, counts, all, anyNested));
        if (projectCollapsed.has(name)) return;
        childrenOf(name, all)
          .sort((a, b) => (priorityProjects.has(b) - priorityProjects.has(a)) ||
            (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b))
          .forEach(k => appendTree(k, depth + 1));
      };

      const shownRoots = showAllProjects ? roots : roots.slice(0, PROJECT_LIMIT);
      shownRoots.forEach(r => appendTree(r, 0));

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
        el.className = `tag-nav ${getTagColorClass(t)}${active ? ' active' : ''}`;
        el.draggable = true;
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
        el.className = `tag-nav ${getTagColorClass(t)}${active ? ' active' : ''}`;
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
      document.getElementById('nav-all').classList.toggle('active', !activeFilter && !activeTags.length && !pinnedView && !recentView);
      const np = document.getElementById('nav-pinned');
      if (np) np.classList.toggle('active', pinnedView);
      const pc = document.getElementById('count-pinned');
      if (pc) pc.innerText = items.filter(i => i.pinned && !i.archived).length;
      const nr = document.getElementById('nav-recent');
      if (nr) nr.classList.toggle('active', recentView);
      const rc = document.getElementById('count-recent');
      if (rc) rc.innerText = Math.min(RECENT_LIMIT, items.filter(i => !i.archived).length);
    }

    // Favourites = starred (priority) projects, quick-access list.
    function renderSidebarFavourites() {
      const c = document.getElementById('favourite-list');
      if (!c) return;
      const counts = new Map();
      for (const i of items) counts.set(i.project, (counts.get(i.project) || 0) + 1);
      const all = allKnownProjects();
      const favs = [...priorityProjects].filter(p => all.includes(p))
        .sort((a, b) => (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b));
      c.innerHTML = '';
      if (!favs.length) { c.innerHTML = '<div class="fav-empty">Star a folder to pin it here</div>'; return; }
      favs.forEach(p => c.appendChild(makeProjectRow(p, 0, counts, all)));
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
      const cls = opts.cls || '';
      const style = opts.style || '';
      if (privacyMode) {
        const letter = esc((d.replace(/^www\./, '').charAt(0) || '?').toUpperCase());
        const cl = ('fav-mono' + (cls ? ' ' + cls : '')).trim();
        return `<span class="${cl}" style="background:hsl(${domainHue(d)} 55% 45%);${style}">${letter}</span>`;
      }
      const classAttr = cls ? ` class="${cls}"` : '';
      const styleAttr = style ? ` style="${style}"` : '';
      return `<img${classAttr} src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=32" alt=""${styleAttr} />`;
    }

    // Toggle Privacy mode (called from the settings switch). Persists + re-renders.
    function setPrivacyMode(on) {
      privacyMode = (on === undefined) ? !privacyMode : !!on;
      try { localStorage.setItem('savemePrivacy', privacyMode ? '1' : '0'); } catch (e) {}
      syncPrivacyToggle();
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
      if (accent) div.style.setProperty('--card-accent', accent);

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
        `<span class="tag ${getTagColorClass(tag)}" title="Filter by #${htmlAttr(tag)}" onclick="filterTag('${jsAttr(tag)}')">#${esc(tag)}<button class="tag-x" title="Remove tag" onclick="event.stopPropagation(); removeTag(${item.id}, '${jsAttr(tag)}')">×</button></span>`
      ).join('');

      const suggHtml = (item.suggestedTags || []).map(tag =>
        `<span class="tag tag-suggested" title="Suggested tag">#${esc(tag)}<button class="tag-confirm" title="Keep tag" onclick="confirmSuggested(${item.id}, '${jsAttr(tag)}')">✓</button><button class="tag-x" title="Dismiss" onclick="dismissSuggested(${item.id}, '${jsAttr(tag)}')">×</button></span>`
      ).join('');

      div.innerHTML = `
        ${item.pinned ? `<span class="pin-flag" title="Pinned">${ICONS.pin || ICONS.star}</span>` : ''}
        <div class="item-thumb-wrap${privacyMode ? ' thumb-failed' : ''}" data-domain="${esc(item.domain)}">
          <img class="item-thumb" loading="lazy" alt="Preview of ${esc(item.domain)}"
            ${privacyMode ? '' : `data-src="https://s.wordpress.com/mshots/v1/${encodeURIComponent(item.url)}?w=520&h=326"`}
            onerror="this.closest('.item-thumb-wrap').classList.add('thumb-failed')" />
          <div class="item-hover-actions">
            <button class="meta-btn pin-btn${item.pinned ? ' on' : ''}" title="${item.pinned ? 'Unpin' : 'Pin to top'}" onclick="event.stopPropagation(); togglePin(${item.id})">${ICONS.pin || ICONS.star}</button>
          </div>
        </div>

        <div class="item-site">
          ${faviconHtml(item.domain, { cls: 'item-favicon' })}
          <a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="item-domain" title="Open link in new tab" onclick="markOpened(${item.id})">${esc(item.domain)}</a>
          ${item.snoozedUntil && item.snoozedUntil > Date.now() ? `<span class="item-age" title="Snoozed">💤</span>` : ''}
        </div>

        <div class="item-main-content">
          <a href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" class="item-title" title="Open link in new tab" onclick="markOpened(${item.id})">${esc(item.title)}</a>
          <div class="item-description">${esc(item.description)}</div>
          <div
            class="item-note"
            contenteditable="true"
            onblur="updateNote(${item.id}, this.innerText)"
            onkeydown="handleNoteKey(event)"
            title="Click to edit note"
          >${item.note ? esc(item.note) : 'Click to add note...'}</div>
        </div>

        <div class="item-meta">
          <span class="tag tag-project" title="Filter by folder" onclick="filterProject('${jsAttr(item.project)}')"><span class="tag-ic"${accent ? ` style="color:${accent}"` : ''}>${projectIconHtml(item.project)}</span>${esc(item.project)}</span>
          ${tagsHtml}
          ${suggHtml}
          <button class="tag-add" title="Add tag" onclick="addTagToItem(${item.id})">+</button>
          <button class="meta-btn pin-btn${item.pinned ? ' on' : ''}" title="${item.pinned ? 'Unpin' : 'Pin to top'}" onclick="event.stopPropagation(); togglePin(${item.id})">${ICONS.pin || ICONS.star}</button>
          <button class="delete-btn" title="Delete" onclick="deleteItem(${item.id})">${ICONS.trash}</button>
        </div>
      `;
      return div;
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
      list.innerHTML = '';
      const stale = document.getElementById('scroll-sentinel');
      if (stale) stale.remove();
      if (_io) { _io.disconnect(); _io = null; }
      _visible = itemList;
      _rendered = 0;
      document.getElementById('count-all').innerText = items.length;

      // Empty states (#4)
      if (!itemList.length) {
        const noneAtAll = items.length === 0;
        const showClear = !noneAtAll && (activeFilter || activeTags.length || searchQuery || pinnedView || recentView);
        const msg = noneAtAll
          ? 'Paste a URL in the top bar and press Enter to save your first bookmark.'
          : (searchQuery ? 'No links match your search. Try fewer words, or filters like tag:react, site:github.com, or is:pinned.'
            : pinnedView ? 'No pinned links yet. Click the pin icon on any card to keep it handy here.'
            : recentView ? 'No links yet — the ones you save will appear here newest-first.'
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
          <div class="empty-title">${noneAtAll ? 'Start saving links' : pinnedView ? 'No pinned links' : recentView ? 'Nothing here yet' : 'No results'}</div>
          <div class="empty-sub">${msg}</div>
          ${showClear ? '<button class="empty-btn" onclick="showAll()">Back to all links</button>' : ''}
        `;
        list.appendChild(wrap);
        return;
      }

      renderNextChunk();
    }

    function updateNote(id, newText) {
      const item = items.find(i => i.id === id);
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
      ['description', 4], ['note', 4], ['url', 3],
    ];
    function _itemFieldText(it, field) {
      switch (field) {
        case 'title': return it.title || '';
        case 'domain': return it.domain || '';
        case 'tags': return (it.autoTags || []).concat(it.suggestedTags || []).join(' ');
        case 'project': return it.project || '';
        case 'description': return it.description || '';
        case 'note': return it.note || '';
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
      const low = text.toLowerCase();
      if (low === token) return 1;
      if (low.includes(token)) return low.startsWith(token) ? 0.95 : 0.82;
      let best = 0;
      for (const w of low.split(/[^a-z0-9]+/)) {
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
      const tokens = rest.toLowerCase().split(/\s+/).filter(Boolean);
      return { filters, phrases, tokens };
    }
    function scoreSearchItem(it, parsed) {
      const { filters, phrases, tokens } = parsed;
      const tags = (it.autoTags || []).concat(it.suggestedTags || []).map(t => t.toLowerCase());
      for (const t of filters.tag) if (!tags.some(x => x.includes(t))) return 0;
      for (const s of filters.site) if (!(it.domain || '').toLowerCase().includes(s)) return 0;
      for (const p of filters.project) if (!(it.project || '').toLowerCase().includes(p)) return 0;
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
          const s = _fieldScore(tok, _itemFieldText(it, f));
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
        out = out.filter(i => wanted.has(i.project));
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
        const parsed = parseSearchQuery(searchQuery);
        const scored = [];
        for (const it of out) {
          const sc = scoreSearchItem(it, parsed);
          if (sc > 0) { it._score = sc; scored.push(it); }
        }
        out = scored;
        searchRanked = true;
      }
      if (searchRanked) {
        // While searching, relevance beats the chosen sort.
        out.sort((a, b) => (b._score - a._score) || (b.id - a.id));
      } else {
        switch (currentSort) {
          case 'oldest': out.sort((a, b) => a.id - b.id); break;
          case 'title':  out.sort((a, b) => a.title.localeCompare(b.title)); break;
          case 'domain': out.sort((a, b) => a.domain.localeCompare(b.domain)); break;
          case 'custom': out.sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)); break;
          default:       out.sort((a, b) => b.id - a.id); // newest
        }
      }
      // "Recently Added" always shows the newest links first, capped, and skips
      // the pinned-float below so it stays a pure chronological view.
      if (recentView) {
        out.sort((a, b) => b.id - a.id);
        if (recentWindow) {
          const now = Date.now();
          out = out.filter(i => (now - (i.added || i.id || 0)) <= recentWindow * DAY_MS);
        }
        return out.slice(0, RECENT_LIMIT);
      }
      // Pinned links float to the top (stable within each group) — but not while
      // searching, where relevance ordering wins.
      if (!searchRanked && out.some(i => i.pinned)) out = out.filter(i => i.pinned).concat(out.filter(i => !i.pinned));
      return out;
    }

    // Drag-reorder cards: move dragged item just before/after the target in the
    // global items array, renumber `order`, switch to "My order", and persist.
    function reorderItem(draggedId, targetId, placeAfter) {
      if (draggedId === targetId) return;
      const from = items.findIndex(i => i.id === draggedId);
      if (from < 0) return;
      const [moved] = items.splice(from, 1);
      let to = items.findIndex(i => i.id === targetId);
      if (to < 0) { items.push(moved); }
      else { if (placeAfter) to += 1; items.splice(to, 0, moved); }
      items.forEach((it, idx) => { it.order = idx; });
      currentSort = 'custom';
      if (typeof markActiveSort === 'function') markActiveSort();
      dbPutMany(items);
      dbSaveProjects();
      refresh();
    }

    function refresh() {
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
      const counts = new Map();
      for (const i of items) counts.set(i.project, (counts.get(i.project) || 0) + 1);

      // Ancestor chain (root → … → current).
      const chain = [];
      let p = activeFilter, guard = new Set();
      while (p && !guard.has(p)) { chain.unshift(p); guard.add(p); p = (projectParent[p] && all.includes(projectParent[p])) ? projectParent[p] : null; }
      const kids = childrenOf(activeFilter, all)
        .sort((a, b) => (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b));

      const cur = activeFilter;
      const isPri = priorityProjects.has(cur);
      const total = rollupCount(cur, counts, all);

      let html = '<div class="sf-head">';

      // Left: folder badge + (optional path) + big project name.
      html += '<div class="sf-id">';
      html += `<div class="sf-badge${isPri ? ' pri' : ''}"${projectColor(cur) ? ` style="background:${projectColor(cur)}"` : ''}>${projectIconHtml(cur)}</div>`;
      html += '<div class="sf-id-text">';
      if (chain.length > 1) {
        const HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/></svg>';
        const CH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';
        let path = `<button class="sf-pcrumb sf-pcrumb-home" onclick="showAll()" title="All links">${HOME}<span>All</span></button>`;
        chain.slice(0, -1).forEach(name => {
          path += `<span class="sf-psep">${CH}</span><button class="sf-pcrumb" onclick="filterProject('${jsAttr(name)}')">${esc(name)}</button>`;
        });
        html += `<div class="sf-path">${path}</div>`;
      }
      html += `<div class="sf-name-row"><span class="sf-name">${esc(cur)}</span><span class="sf-count-badge">${total}</span></div>`;
      html += '</div></div>';

      // Right: grouped action buttons — safe actions, a divider, then Delete.
      html += `<div class="sf-actions">
        <button class="sf-act${isPri ? ' on' : ''}" data-tip="${isPri ? 'Remove priority' : 'Mark as priority'}" aria-label="${isPri ? 'Remove priority' : 'Mark as priority'}" onclick="togglePriority(event, '${jsAttr(cur)}')">${ICONS.star}</button>
        <button class="sf-act" data-tip="Icon & color" aria-label="Icon & color" onclick="openFolderCustomize(event, '${jsAttr(cur)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="16" cy="15" r="2.5"/><circle cx="8" cy="19" r="2"/></svg></button>
        <button class="sf-act" data-tip="New subfolder" aria-label="New subfolder" onclick="addSubfolder(event, '${jsAttr(cur)}')">${ICONS.folderPlus}</button>
        <button class="sf-act" data-tip="Rename folder" aria-label="Rename folder" onclick="renameProject(event, '${jsAttr(cur)}')">${ICONS.edit}</button>
        <span class="sf-act-sep" aria-hidden="true"></span>
        <button class="sf-act sf-act-danger" data-tip="Delete folder" aria-label="Delete folder" onclick="deleteProject(event, '${jsAttr(cur)}')">${ICONS.trash}</button>
      </div>`;
      html += '</div>';

      // Sub-folder cards.
      html += '<div class="sf-chips">';
      html += '<span class="sf-label">Sub-folders</span>';
      kids.forEach(k => {
        html += `<button class="sf-chip" onclick="filterProject('${jsAttr(k)}')"
          ondragover="sfChipDragOver(event,this)"
          ondragleave="this.classList.remove('sf-drop');"
          ondrop="sfChipDrop(event,this,'${jsAttr(k)}')">
          <span class="sf-chip-ic"${projectColor(k) ? ` style="background:${projectColor(k)}22;color:${projectColor(k)}"` : ''}>${projectIconHtml(k)}</span>
          <span class="sf-chip-name">${esc(k)}</span>
          <span class="sf-chip-count">${rollupCount(k, counts, all)}</span></button>`;
      });
      html += `<button class="sf-chip sf-add" onclick="addSubfolder(event, '${jsAttr(cur)}')" title="New sub-folder">${ICONS.folderPlus}<span>New folder</span></button>`;
      html += '</div>';

      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    // Smart view header for "Pinned Links" — icon badge, live count, hint.
    function renderPinnedBanner(bar) {
      const n = items.filter(i => i.pinned && !i.archived).length;
      const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3v2h-5v5l-1 1-1-1v-5H4v-2l3-3z"/></svg>';
      let html = '<div class="sf-head"><div class="sf-id">';
      html += `<div class="sf-badge sf-badge-pinned">${PIN}</div>`;
      html += '<div class="sf-id-text">';
      html += `<div class="sf-name-row"><span class="sf-name">Pinned Links</span><span class="sf-count-badge">${n}</span></div>`;
      html += `<span class="sf-sub">${n ? 'Your quick-access links, always on top' : 'Click the pin icon on any card to keep it here'}</span>`;
      html += '</div></div>';
      html += `<div class="sf-actions"><button class="sf-act" title="Back to all links" onclick="showAll()">${ICONS.folder}</button></div>`;
      html += '</div>';
      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    // Smart view header for "Recently Added" — newest count + live time-bucket stats.
    function renderRecentBanner(bar) {
      const live = items.filter(i => !i.archived);
      const now = Date.now();
      const within = d => live.filter(i => (now - (i.added || i.id || 0)) <= d * DAY_MS).length;
      const today = within(1), week = within(7), month = within(30);
      const shown = Math.min(RECENT_LIMIT, live.length);
      const CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
      let html = '<div class="sf-head"><div class="sf-id">';
      html += `<div class="sf-badge sf-badge-recent">${CLOCK}</div>`;
      html += '<div class="sf-id-text">';
      html += `<div class="sf-name-row"><span class="sf-name">Recently Added</span><span class="sf-count-badge">${shown}</span></div>`;
      html += `<span class="sf-sub">Your ${shown} newest link${shown === 1 ? '' : 's'}, chronological</span>`;
      html += '</div></div>';
      html += `<div class="sf-actions"><button class="sf-act" title="Back to all links" onclick="showAll()">${ICONS.folder}</button></div>`;
      html += '</div>';
      html += '<div class="sf-chips">';
      html += '<span class="sf-label">Added</span>';
      html += `<button class="sf-stat${recentWindow === 1 ? ' active' : ''}" onclick="setRecentWindow(1)"><span class="sf-stat-n">${today}</span> today</button>`;
      html += `<button class="sf-stat${recentWindow === 7 ? ' active' : ''}" onclick="setRecentWindow(7)"><span class="sf-stat-n">${week}</span> this week</button>`;
      html += `<button class="sf-stat${recentWindow === 30 ? ' active' : ''}" onclick="setRecentWindow(30)"><span class="sf-stat-n">${month}</span> this month</button>`;
      if (recentWindow) html += `<button class="sf-stat sf-stat-clear" onclick="clearRecentWindow()">Clear ✕</button>`;
      html += '</div>';
      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    // Toggle a time window on the Recently Added view (click same chip to clear).
    function setRecentWindow(d) {
      recentWindow = (recentWindow === d) ? 0 : d;
      refresh();
    }
    function clearRecentWindow() {
      recentWindow = 0;
      refresh();
    }

    // Smart overview shown on the "All Links" root view: total, top-level folders
    // as jump-in chips (drop targets), and a New-folder action.
    let allFoldersExpanded = false;
    function expandAllFolders() { allFoldersExpanded = true; renderSubfolderBar(); }
    function collapseAllFolders() { allFoldersExpanded = false; renderSubfolderBar(); }
    function renderAllOverview(bar) {
      const all = allKnownProjects();
      const counts = new Map();
      for (const i of items) counts.set(i.project, (counts.get(i.project) || 0) + 1);
      const parentOf = p => (projectParent[p] && all.includes(projectParent[p])) ? projectParent[p] : null;
      const roots = all.filter(p => !parentOf(p))
        .sort((a, b) => (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b));
      const CAP = 24;
      const shown = allFoldersExpanded ? roots : roots.slice(0, CAP);
      const extra = roots.length - shown.length;
      const GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

      let html = '<div class="sf-head"><div class="sf-id">';
      html += `<div class="sf-badge sf-badge-all">${GRID}</div>`;
      html += '<div class="sf-id-text">';
      html += `<div class="sf-name-row"><span class="sf-name">All Links</span><span class="sf-count-badge">${items.length}</span></div>`;
      html += `<span class="sf-sub">${roots.length} folder${roots.length === 1 ? '' : 's'}</span>`;
      html += '</div></div>';
      html += `<div class="sf-actions"><button class="sf-act" title="New folder" onclick="addNewProject()">${ICONS.folderPlus}</button></div>`;
      html += '</div>';

      html += '<div class="sf-chips">';
      html += '<span class="sf-label">Folders</span>';
      shown.forEach(k => {
        html += `<button class="sf-chip" onclick="filterProject('${jsAttr(k)}')"
          ondragover="sfChipDragOver(event,this)"
          ondragleave="this.classList.remove('sf-drop');"
          ondrop="sfChipDrop(event,this,'${jsAttr(k)}')">
          <span class="sf-chip-ic"${projectColor(k) ? ` style="background:${projectColor(k)}22;color:${projectColor(k)}"` : ''}>${projectIconHtml(k)}</span>
          <span class="sf-chip-name">${esc(k)}</span>
          <span class="sf-chip-count">${rollupCount(k, counts, all)}</span></button>`;
      });
      if (extra > 0) html += `<button class="sf-more" onclick="expandAllFolders()" title="Show all folders">+${extra} more</button>`;
      else if (allFoldersExpanded && roots.length > CAP) html += `<button class="sf-more" onclick="collapseAllFolders()" title="Show fewer">Show less</button>`;
      html += `<button class="sf-chip sf-add" onclick="addNewProject()" title="New folder">${ICONS.folderPlus}<span>New folder</span></button>`;
      html += '</div>';

      bar.innerHTML = html;
      bar.style.display = 'block';
    }

    function setSort(value) {
      currentSort = value;
      refresh();
    }

    // ---- Input / save (#6 duplicate detection) ----
    function handleInput(e) {
      if (e.key !== 'Enter') return;
      const value = e.target.value.trim();
      if (!value) return;
      if (!(value.startsWith('http://') || value.startsWith('https://'))) return;

      let parsedUrl;
      try { parsedUrl = new URL(value); } catch (err) { alert('Invalid URL format'); return; }

      const norm = normalizeUrl(value);
      const existing = items.find(i => normalizeUrl(i.url) === norm);
      if (existing) {
        activeFilter = null; activeTags = []; searchQuery = '';
        document.getElementById('searchInput').value = '';
        refresh();
        flashItem(existing.id);
        showToast('Already saved — highlighting it');
        e.target.value = '';
        return;
      }

      const niceTitle = prettifyTitle(parsedUrl.pathname, parsedUrl.hostname);
      const { autoTags, suggestedTags, description } = generateLinkMetadata(value, parsedUrl.hostname, parsedUrl.pathname, niceTitle);
      let project;
      if (activeFilter) {
        project = activeFilter;
      } else {
        project = chooseProject({ autoTags }, parsedUrl.hostname);
        ensureProject(project, false);
      }
      const newItem = {
        id: Date.now(),
        added: Date.now(),
        url: value,
        title: niceTitle,
        domain: parsedUrl.hostname,
        description: description,
        autoTags: autoTags,
        suggestedTags: suggestedTags || [],
        note: "Click to add note...",
        project: project
      };
      items.unshift(newItem);
      dbPut(newItem);
      e.target.value = '';
      refresh();
      flashItem(newItem.id);
    }

    document.getElementById('searchInput').addEventListener('input', (e) => {
      const raw = e.target.value.trim();
      const bar = document.getElementById('searchBar');
      if (bar) bar.classList.toggle('has-text', !!e.target.value);
      if (raw.startsWith('http')) { searchQuery = ''; projectQuery = ''; renderSidebarProjects(); return; }
      if (raw) { pinnedView = false; recentView = false; }
      searchQuery = raw;
      // General search also finds folders: filter the sidebar project tree too.
      projectQuery = raw.toLowerCase();
      refresh();
      clearTimeout(_searchNavTimer);
      _searchNavTimer = setTimeout(recordNav, 600);
    });
    let _searchNavTimer = null;

    function clearMainSearch() {
      const inp = document.getElementById('searchInput');
      if (inp) inp.value = '';
      searchQuery = '';
      projectQuery = '';
      const bar = document.getElementById('searchBar');
      if (bar) bar.classList.remove('has-text');
      refresh();
      if (inp) inp.focus();
    }

    function deleteItem(id) {
      const idx = items.findIndex(i => i.id === id);
      if (idx < 0) return;
      const removed = items[idx];
      items = items.filter(i => i.id !== id);
      dbDelete(id);
      refresh();
      showToast('Link deleted', () => {
        items.splice(Math.min(idx, items.length), 0, removed);
        dbPut(removed);
        refresh();
        flashItem(removed.id);
      });
    }

    // Pin / unpin a link — pinned links float to the top of every view.
    function togglePin(id) {
      const item = items.find(i => i.id === id);
      if (!item) return;
      item.pinned = !item.pinned;
      dbPut(item);
      refresh();
    }

    // Record that a link was opened — powers "Stale" detection (#7).
    function markOpened(id) {
      const item = items.find(i => i.id === id);
      if (!item) return;
      item.lastOpened = Date.now();
      dbPut(item);   // no refresh — the click is navigating away in a new tab
    }

    // ---- Snooze (#9) ----------
    function snoozeItem(id, days) {
      const item = items.find(i => i.id === id);
      if (!item) return;
      item.snoozedUntil = Date.now() + days * DAY_MS;
      dbPut(item);
      refresh();
      const when = days >= 7 ? `${Math.round(days / 7)} week${days >= 14 ? 's' : ''}` : `${days} day${days > 1 ? 's' : ''}`;
      showToast(`Snoozed for ${when}`, () => { const it = items.find(i => i.id === id); if (it) { delete it.snoozedUntil; dbPut(it); refresh(); } });
    }
    function unsnoozeItem(id) {
      const item = items.find(i => i.id === id);
      if (!item) return;
      delete item.snoozedUntil;
      dbPut(item);
      refresh();
    }
    function toggleArchive(id) {
      const item = items.find(i => i.id === id);
      if (!item) return;
      item.archived = !item.archived;
      dbPut(item);
      refresh();
      if (item.archived) showToast('Archived', () => { const it = items.find(i => i.id === id); if (it) { delete it.archived; dbPut(it); refresh(); } });
    }

    // ---- Quick-capture bookmarklet (#10) ------------------------------------
    function bookmarkletHref() {
      const base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('#')[0];
      // Opens saveto.me with ?add=<current tab URL>; the app saves it on load.
      return "javascript:(function(){window.open('" + base + "?add='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank');})();";
    }
    function handleAddParam() {
      let params;
      try { params = new URLSearchParams(location.search); } catch (_) { return; }
      const add = params.get('add');
      if (!add) return;
      try { history.replaceState(null, '', location.pathname); } catch (_) {}
      try {
        const parsedUrl = new URL(add);
        const norm = normalizeUrl(add);
        const existing = items.find(i => normalizeUrl(i.url) === norm);
        if (existing) { flashItem(existing.id); showToast('Already saved — highlighting it'); return; }
        const titleParam = params.get('title');
        const niceTitle = titleParam || prettifyTitle(parsedUrl.pathname, parsedUrl.hostname);
        const { autoTags, suggestedTags, description } = generateLinkMetadata(add, parsedUrl.hostname, parsedUrl.pathname, niceTitle);
        const project = activeFilter || chooseProject({ autoTags }, parsedUrl.hostname);
        ensureProject(project, false);
        const newItem = {
          id: Date.now(), added: Date.now(), url: add,
          title: niceTitle,
          domain: parsedUrl.hostname, description, autoTags, suggestedTags: suggestedTags || [],
          note: 'Click to add note...', project
        };
        items.unshift(newItem);
        dbPut(newItem);
        refresh();
        flashItem(newItem.id);
        showToast('Saved from bookmarklet');
      } catch (_) { /* ignore malformed add param */ }
    }

    // ---- Keyboard shortcuts cheat sheet -------------------------------------
    function openShortcuts() { document.getElementById('shortcutsOverlay').classList.add('show'); }
    function closeShortcuts() { document.getElementById('shortcutsOverlay').classList.remove('show'); }

    function filterProject(projectName) {
      pinnedView = false;
      recentView = false;
      activeFilter = (activeFilter === projectName) ? null : projectName;
      refresh();
      recordNav();
    }

    function filterTag(tag) {
      pinnedView = false;
      recentView = false;
      const i = activeTags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
      if (i >= 0) activeTags.splice(i, 1);      // toggle off
      else activeTags.push(tag);                // add (multi-select, composes)
      refresh();
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
      return { f: activeFilter, t: activeTags.slice(), tm: tagMode, q: searchQuery, p: pinnedView, r: recentView };
    }
    function navEqual(a, b) {
      return a && b && a.f === b.f && a.q === b.q && !!a.p === !!b.p && !!a.r === !!b.r && a.tm === b.tm &&
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
      const item = items.find(i => i.id === id);
      if (!item) return;
      const had = (item.autoTags || []).includes(tag);
      item.autoTags = (item.autoTags || []).filter(t => t !== tag);
      recordTagOverride(item.domain, tag, 'remove');
      dbPut(item);
      refresh();
      if (had) showToast(`Removed #${tag}`, () => {
        const it = items.find(i => i.id === id);
        if (!it) return;
        it.autoTags = it.autoTags || [];
        if (!it.autoTags.includes(tag)) it.autoTags.push(tag);
        dbPut(it);
        refresh();
      });
    }

    async function addTagToItem(id) {
      const item = items.find(i => i.id === id);
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
      const item = items.find(i => i.id === id);
      if (!item) return;
      item.suggestedTags = (item.suggestedTags || []).filter(t => t !== tag);
      item.autoTags = item.autoTags || [];
      if (!item.autoTags.some(t => t.toLowerCase() === tag.toLowerCase())) item.autoTags.push(tag);
      recordTagOverride(item.domain, tag, 'add');
      dbPut(item);
      refresh();
    }

    function dismissSuggested(id, tag) {
      const item = items.find(i => i.id === id);
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
        { type: 'cmd', label: 'Toggle dark mode', sub: 'Light / dark workspace', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>', run: () => { toggleTheme(); } },
        { type: 'cmd', label: 'Import / export', sub: 'Bookmarks & backup', icon: ICONS.edit, run: () => { openSettings(); } },
        { type: 'cmd', label: 'Check links', sub: 'Duplicates & broken', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>', run: () => { openHealth(); } },
        { type: 'cmd', label: 'Auto-organize', sub: 'Bulk file into folders', icon: ICONS.folder, run: () => { openOrganize(); } },
        { type: 'cmd', label: 'Keyboard shortcuts', sub: 'View all hotkeys', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg>', run: () => { openShortcuts(); } },
      ];
    }

    function renderCmdk(query) {
      const q = (query || '').trim().toLowerCase();
      const listEl = document.getElementById('cmdkList');
      const all = allKnownProjects();
      const counts = new Map();
      for (const i of items) counts.set(i.project, (counts.get(i.project) || 0) + 1);
      const tagCounts = {};
      items.forEach(i => (i.autoTags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));

      const groups = [];

      // Commands
      const cmds = cmdkCommands().filter(c => !q || c.label.toLowerCase().includes(q) || (c.sub || '').toLowerCase().includes(q));
      if (cmds.length) groups.push({ label: 'Actions', rows: cmds });

      // Folders
      const folders = all.filter(p => !q || p.toLowerCase().includes(q))
        .sort((a, b) => (rollupCount(b, counts, all) - rollupCount(a, counts, all)) || a.localeCompare(b))
        .slice(0, q ? 8 : 6)
        .map(p => ({ type: 'folder', label: p, sub: 'Folder', icon: projectIconHtml(p), color: projectColor(p), meta: String(rollupCount(p, counts, all)), run: () => { filterProject(p); } }));
      if (folders.length) groups.push({ label: 'Folders', rows: folders });

      // Tags
      const tags = Object.keys(tagCounts).filter(t => !q || t.toLowerCase().includes(q))
        .sort((a, b) => tagCounts[b] - tagCounts[a] || a.localeCompare(b))
        .slice(0, q ? 8 : 5)
        .map(t => ({ type: 'tag', label: '#' + t, sub: 'Tag', icon: ICONS.hash, meta: String(tagCounts[t]), run: () => { activeTags = []; filterTag(t); } }));
      if (tags.length) groups.push({ label: 'Tags', rows: tags });

      // Links (only when searching)
      if (q) {
        const links = items.filter(i =>
          i.title.toLowerCase().includes(q) || i.domain.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q)
        ).slice(0, 8).map(i => ({
          type: 'link', label: i.title, sub: i.domain,
          icon: faviconHtml(i.domain, { style: 'width:18px;height:18px;border-radius:4px' }),
          run: () => { window.open(i.url, '_blank'); }
        }));
        if (links.length) groups.push({ label: 'Links', rows: links });
      } else {
        // No query → surface the most recently saved links as a jumping-off point.
        const recents = items.slice().sort((a, b) => (itemTimestamp(b) || b.id) - (itemTimestamp(a) || a.id))
          .slice(0, 5).map(i => ({
            type: 'link', label: i.title, sub: i.domain,
            icon: faviconHtml(i.domain, { style: 'width:18px;height:18px;border-radius:4px' }),
            run: () => { window.open(i.url, '_blank'); }
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
          const icStyle = r.color ? ` style="background:${r.color}22;color:${r.color}"` : '';
          html += `<div class="cmdk-row${idx === 0 ? ' active' : ''}" data-idx="${idx}" onmousemove="cmdkHover(${idx})" onclick="cmdkRun(${idx})">
            <span class="cmdk-ic"${icStyle}>${r.icon}</span>
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
    function openSettings() {
      document.getElementById('importStatus').textContent = '';
      const bm = document.getElementById('bookmarkletLink');
      if (bm) bm.setAttribute('href', bookmarkletHref());
      syncPrivacyToggle();
      document.getElementById('settingsOverlay').classList.add('show');
    }
    function closeSettings() {
      document.getElementById('settingsOverlay').classList.remove('show');
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
    function openHealth() {
      document.getElementById('healthStatus').textContent = '';
      document.getElementById('healthList').innerHTML = '';
      document.getElementById('healthFoot').style.display = 'none';
      const sa = document.getElementById('healthSelAll'); if (sa) sa.checked = false;
      healthResults = [];
      document.getElementById('healthOverlay').classList.add('show');
    }
    function closeHealth() {
      document.getElementById('healthOverlay').classList.remove('show');
    }

    function isValidUrl(u) {
      try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; }
      catch (e) { return false; }
    }

    // Best-effort reachability. CORS prevents reading the response, so a resolved
    // no-cors fetch (opaque) counts as "reachable" and only a network error/timeout
    // (dead domain, DNS failure) counts as "unreachable". Honest about the limit.
    function probeUrl(url, timeoutMs) {
      return new Promise((resolve) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => { ctrl.abort(); resolve(false); }, timeoutMs);
        fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' })
          .then(() => { clearTimeout(t); resolve(true); })
          .catch(() => {
            // Retry as GET — some servers reject HEAD.
            fetch(url, { method: 'GET', mode: 'no-cors', signal: ctrl.signal, cache: 'no-store' })
              .then(() => { clearTimeout(t); resolve(true); })
              .catch(() => { clearTimeout(t); resolve(false); });
          });
      });
    }

    async function runHealthCheck() {
      const status = document.getElementById('healthStatus');
      const listEl = document.getElementById('healthList');
      const foot = document.getElementById('healthFoot');
      const btn = document.getElementById('healthScanBtn');
      const doReach = document.getElementById('healthReach').checked;
      listEl.innerHTML = '';
      foot.style.display = 'none';
      healthResults = [];
      btn.disabled = true;
      status.textContent = 'Scanning…';

      // Invalid + duplicates (instant, local).
      const seen = new Map();       // normalized url -> first item id
      const flagged = new Map();    // id -> issue label
      for (const it of items) {
        if (!it.url || !isValidUrl(it.url)) { flagged.set(it.id, 'invalid'); continue; }
        const norm = normalizeUrl(it.url);
        if (seen.has(norm)) flagged.set(it.id, 'duplicate');
        else seen.set(norm, it.id);
      }

      // Optional reachability probe (skips already-invalid ones).
      if (doReach) {
        const targets = items.filter(it => it.url && isValidUrl(it.url) && flagged.get(it.id) !== 'duplicate');
        let done = 0;
        const CONC = 6;
        let idx = 0;
        async function worker() {
          while (idx < targets.length) {
            const it = targets[idx++];
            const ok = await probeUrl(it.url, 8000);
            if (!ok && !flagged.has(it.id)) flagged.set(it.id, 'unreachable');
            done++;
            status.textContent = `Checking reachability… ${done}/${targets.length}`;
          }
        }
        await Promise.all(Array.from({ length: Math.min(CONC, targets.length) }, worker));
      }

      healthResults = items.filter(it => flagged.has(it.id))
        .map(it => ({ id: it.id, url: it.url, title: it.title || it.url, project: it.project, issue: flagged.get(it.id) }));

      renderHealthList();
      const n = healthResults.length;
      status.textContent = n ? `${n} link${n > 1 ? 's' : ''} flagged.` : 'No problems found — all links look good.';
      if (n) foot.style.display = 'flex';
      btn.disabled = false;
    }

    function renderHealthList() {
      const listEl = document.getElementById('healthList');
      listEl.innerHTML = '';
      const labels = { duplicate: 'Duplicate', invalid: 'Invalid URL', unreachable: 'Unreachable' };
      healthResults.forEach(r => {
        const row = document.createElement('label');
        row.className = 'health-row';
        row.innerHTML = `
          <input type="checkbox" class="health-cb" data-id="${r.id}" />
          <span class="health-badge health-${r.issue}">${labels[r.issue]}</span>
          <span class="health-info">
            <span class="health-title">${htmlAttr(r.title)}</span>
            <span class="health-url">${htmlAttr(r.url)}</span>
          </span>`;
        listEl.appendChild(row);
      });
    }

    function toggleHealthSelectAll(checked) {
      document.querySelectorAll('#healthList .health-cb').forEach(cb => { cb.checked = checked; });
    }

    function removeHealthSelected() {
      const ids = [...document.querySelectorAll('#healthList .health-cb')]
        .filter(cb => cb.checked).map(cb => parseInt(cb.dataset.id, 10));
      if (!ids.length) return;
      const idset = new Set(ids);
      items = items.filter(i => !idset.has(i.id));
      dbDeleteMany(ids);
      healthResults = healthResults.filter(r => !idset.has(r.id));
      renderHealthList();
      const foot = document.getElementById('healthFoot');
      if (!healthResults.length) foot.style.display = 'none';
      document.getElementById('healthStatus').textContent = `Removed ${ids.length} link${ids.length > 1 ? 's' : ''}.`;
      const sa = document.getElementById('healthSelAll'); if (sa) sa.checked = false;
      refresh();
    }

    // Gentler than delete — archive flagged links so they leave the main view but
    // stay recoverable in the Archived smart view.
    function archiveHealthSelected() {
      const ids = [...document.querySelectorAll('#healthList .health-cb')]
        .filter(cb => cb.checked).map(cb => parseInt(cb.dataset.id, 10));
      if (!ids.length) return;
      const idset = new Set(ids);
      const changed = [];
      items.forEach(i => { if (idset.has(i.id) && !i.archived) { i.archived = true; changed.push(i); } });
      dbPutMany(changed);
      healthResults = healthResults.filter(r => !idset.has(r.id));
      renderHealthList();
      const foot = document.getElementById('healthFoot');
      if (!healthResults.length) foot.style.display = 'none';
      document.getElementById('healthStatus').textContent = `Archived ${ids.length} link${ids.length > 1 ? 's' : ''}.`;
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
          <input type="checkbox" class="organize-cb" data-id="${r.id}" checked />
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
          if (target && target !== i.project) { ensureProject(target, false); i.project = target; changed.push(i); }
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
        version: 2,
        exportedAt: new Date().toISOString(),
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
        if (!byProject.has(i.project)) byProject.set(i.project, []);
        byProject.get(i.project).push(i);
      }
      const parentOf = p => (projectParent[p] && all.includes(projectParent[p])) ? projectParent[p] : null;
      const roots = all.filter(p => !parentOf(p)).sort((a, b) => a.localeCompare(b));
      const kidsOf = p => all.filter(c => parentOf(c) === p).sort((a, b) => a.localeCompare(b));

      function emit(proj, depth) {
        const pad = '    '.repeat(depth + 1);
        let s = `${pad}<DT><H3>${esc(proj)}</H3>\n${pad}<DL><p>\n`;
        for (const i of (byProject.get(proj) || [])) {
          const tags = (i.autoTags || []).join(',');
          s += `${pad}    <DT><A HREF="${esc(i.url)}"${tags ? ` TAGS="${esc(tags)}"` : ''}>${esc(i.title || i.domain)}</A>\n`;
        }
        for (const c of kidsOf(proj)) s += emit(c, depth + 1);
        s += `${pad}</DL><p>\n`;
        return s;
      }
      const body = roots.map(r => emit(r, 0)).join('');
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}</DL><p>\n`;
      downloadFile('saveto.me-bookmarks.html', html, 'text/html');
    }

    function handleImportFile(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const status = document.getElementById('importStatus');
        try {
          const text = String(reader.result);
          const trimmed = text.trim();
          const added = (/\.json$/i.test(file.name) || trimmed.startsWith('{') || trimmed.startsWith('['))
            ? importJSON(text) : importBookmarksHTML(text);
          status.textContent = added > 0
            ? `Imported ${added} new link${added === 1 ? '' : 's'}.`
            : 'No new links found (all duplicates or empty).';
        } catch (err) {
          status.textContent = 'Import failed: ' + err.message;
        }
        e.target.value = '';
      };
      reader.readAsText(file);
    }

    function importJSON(text) {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : (data.items || []);
      const projs = Array.isArray(data.projects) ? data.projects : [];
      projs.forEach(p => { if (p && !customProjects.includes(p)) customProjects.push(p); });
      // Restore favourites + folder hierarchy + tag order (v2 backups).
      if (Array.isArray(data.priorityProjects)) data.priorityProjects.forEach(p => { if (p) priorityProjects.add(p); });
      if (data.projectParent && typeof data.projectParent === 'object') {
        for (const [child, parent] of Object.entries(data.projectParent)) {
          if (child && parent && child !== parent) projectParent[child] = parent;
        }
      }
      if (Array.isArray(data.tagOrder) && !tagOrder.length) tagOrder = data.tagOrder.slice();
      const added = ingestLinks(arr.filter(x => x && x.url));
      dbSaveProjects();
      renderSidebar();
      renderSubfolderBar();
      return added;
    }

    // Walk the nested Netscape <DL> tree so sub-folders keep their parent.
    function importBookmarksHTML(text) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const incoming = [];
      const parentMap = {};
      const folders = new Set();

      function walkDL(dl, parentName) {
        const kids = Array.from(dl.children);
        for (let idx = 0; idx < kids.length; idx++) {
          const el = kids[idx];
          if (el.tagName === 'DL') { walkDL(el, parentName); continue; }
          if (el.tagName !== 'DT') continue;
          const h3 = el.querySelector(':scope > h3, :scope > H3');
          const a = el.querySelector(':scope > a, :scope > A');
          if (h3) {
            const name = (h3.textContent || '').trim() || 'Imported';
            folders.add(name);
            if (parentName && name !== parentName) parentMap[name] = parentName;
            let sub = el.querySelector(':scope > dl, :scope > DL');
            if (!sub) { const next = kids[idx + 1]; if (next && next.tagName === 'DL') { sub = next; idx++; } }
            if (sub) walkDL(sub, name);
          } else if (a) {
            const href = a.getAttribute('href') || '';
            if (!/^https?:/i.test(href)) continue;   // skip javascript:, place:, data: etc.
            incoming.push({ url: href, title: (a.textContent || '').trim(), project: parentName || 'Imported' });
          }
        }
      }
      const topDL = doc.querySelector('dl');
      if (topDL) walkDL(topDL, null);

      // Make every folder a project and record its parent before ingesting links.
      folders.forEach(f => { if (!customProjects.includes(f)) customProjects.push(f); });
      for (const [child, parent] of Object.entries(parentMap)) {
        if (folders.has(child) && folders.has(parent) && child !== parent) projectParent[child] = parent;
      }
      const added = ingestLinks(incoming);
      dbSaveProjects();
      renderSidebar();
      renderSubfolderBar();
      return added;
    }

    async function confirmReclassify() {
      const ok = await uiConfirm({
        title: 'Re-classify all links?',
        message: `Re-tags and re-describes all ${items.length} link${items.length === 1 ? '' : 's'} with the latest rules, and re-files ones in an ill-fitting auto-folder. Notes, pins, and manual folders are kept.`,
        okLabel: 'Re-classify',
      });
      if (ok) reclassifyAllLinks();
    }

    // Re-run the (improved) on-device classifier over every stored link.
    // Refreshes tags + description. Respects learned per-domain overrides
    // (applied inside generateLinkMetadata) and never touches user notes,
    // titles, pins, or manually-created (priority) folders. Links still sitting
    // in an AUTO folder that was named after a tag they no longer carry get
    // re-filed into the newly inferred folder (this is what fixes the old
    // "stockx.com → Social" mistakes).
    function reclassifyAllLinks() {      let tagChanged = 0, moved = 0;
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
        it.suggestedTags = meta.suggestedTags;
        it.description = meta.description;

        // Re-file only when the current folder is an AUTO (non-priority) folder
        // that was clearly named after an OLD tag the link no longer has.
        const proj = it.project;
        if (proj && !priorityProjects.has(proj)) {
          const pl = proj.toLowerCase();
          const matchedOld = oldTags.some(t => t.toLowerCase() === pl);
          const matchedNew = meta.autoTags.some(t => t.toLowerCase() === pl);
          if (matchedOld && !matchedNew) {
            const dest = inferProjectName(meta.autoTags, host);
            if (dest && dest !== proj) { ensureProject(dest, false); it.project = dest; moved++; dirty = true; }
          }
        }
        if (dirty || !sameTags) touched.push(it);
      }
      if (touched.length) { dbPutMany(touched); dbSaveProjects(); }
      refresh();
      showToast(`Re-classified ${items.length} link${items.length === 1 ? '' : 's'} · ${tagChanged} re-tagged · ${moved} moved`);
    }

    // Shared merge: dedupe by normalized URL, fill missing metadata, persist.
    function ingestLinks(incoming) {      const existing = new Set(items.map(i => normalizeUrl(i.url)));
      const toAdd = [];
      let seq = 0;
      for (const raw of incoming) {
        if (!raw || !raw.url) continue;
        const norm = normalizeUrl(raw.url);
        if (existing.has(norm)) continue;
        existing.add(norm);
        let host = raw.domain || '', path = '/';
        try { const u = new URL(raw.url); host = host || u.hostname; path = u.pathname; } catch (_) {}
        const meta = generateLinkMetadata(raw.url, host || raw.url, path, raw.title || prettifyTitle(path, host));
        const project = raw.project || 'Imported';
        if (!customProjects.includes(project)) customProjects.push(project);
        toAdd.push({
          id: Date.now() + (seq++),
          added: raw.added || (Date.now() + seq),
          url: raw.url,
          title: raw.title || host || raw.url,
          domain: host || raw.url,
          description: raw.description || meta.description,
          autoTags: (raw.autoTags && raw.autoTags.length) ? raw.autoTags : meta.autoTags,
          suggestedTags: raw.suggestedTags || meta.suggestedTags || [],
          note: raw.note || 'Click to add note...',
          project
        });
      }
      if (toAdd.length) {
        items = toAdd.concat(items);
        dbPutMany(toAdd);
        dbSaveProjects();
        refresh();
      }
      return toAdd.length;
    }

    // ==========================================================================
    //  Persistence — IndexedDB (scales past 100k links; async, no 5 MB cap)
    //  Targeted writes only touch changed rows — we never rewrite the whole store.
    // ==========================================================================
    const DB_NAME = 'savemeDB', DB_VERSION = 1;
    let _db = null;

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

    function dbPut(item)       { item.updatedAt = Date.now(); if (_db) _db.transaction('links', 'readwrite').objectStore('links').put(item); cloudMarkDirty(item.id); cloudSchedulePush(); }
    function dbPutMany(arr)    { if (!arr || !arr.length) return; const now = Date.now(); arr.forEach(i => { i.updatedAt = now; }); if (_db) { const s = _db.transaction('links', 'readwrite').objectStore('links'); arr.forEach(i => s.put(i)); } arr.forEach(i => cloudMarkDirty(i.id)); cloudSchedulePush(); }
    function dbDelete(id)      { if (_db) _db.transaction('links', 'readwrite').objectStore('links').delete(id); cloudMarkDeleted(id); cloudSchedulePush(); }
    function dbDeleteMany(ids) { if (!ids || !ids.length) return; if (_db) { const s = _db.transaction('links', 'readwrite').objectStore('links'); ids.forEach(id => s.delete(id)); } ids.forEach(id => cloudMarkDeleted(id)); cloudSchedulePush(); }
    function dbSaveProjects()  {
      if (!cloud.suspend) cloud.settingsDirty = true;
      cloudSchedulePush();
      if (!_db) return;
      const s = _db.transaction('meta', 'readwrite').objectStore('meta');
      s.put({ key: 'customProjects', value: customProjects });
      s.put({ key: 'priorityProjects', value: [...priorityProjects] });
      s.put({ key: 'projectParent', value: projectParent });
      s.put({ key: 'projectCollapsed', value: [...projectCollapsed] });
      s.put({ key: 'tagOrder', value: tagOrder });
      s.put({ key: 'projectMeta', value: projectMeta });
    }

    // Bump to trigger a one-time, non-destructive re-derive of demo projects.
    const SEED_VERSION = 2;

    // Turn the generic "General" demo links into topical auto-projects so the
    // auto-generation feature is visible on existing data. Runs once per version.
    function migrateSeedProjects() {
      const changed = [];
      items.forEach(i => {
        if (i.project === 'General') {
          const p = inferProjectName(i.autoTags, i.domain);
          if (p && p !== 'General') { i.project = p; ensureProject(p, false); changed.push(i); }
        }
      });
      // "General" is a fallback bucket, never a starred manual project.
      priorityProjects.delete('General');
      if (changed.length) dbPutMany(changed);
      dbSaveProjects();
    }

    async function initStore() {
      try { _db = await openDB(); }
      catch (e) { console.warn('IndexedDB unavailable — running in-memory only', e); refresh(); recordNav(); return; }
      try {
        const saved = await idbGetAll('links');
        if (saved.length) {
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
          const sv = await idbGet('meta', 'seedVersion');
          if (!sv || sv.value < SEED_VERSION) {
            migrateSeedProjects();
            if (_db) _db.transaction('meta', 'readwrite').objectStore('meta').put({ key: 'seedVersion', value: SEED_VERSION });
          }
        } else {
          // First run: derive topical auto-projects, then seed the store.
          migrateSeedProjects();
          dbPutMany(items);
          dbSaveProjects();
          if (_db) _db.transaction('meta', 'readwrite').objectStore('meta').put({ key: 'seedVersion', value: SEED_VERSION });
        }
      } catch (e) { console.warn('IndexedDB load failed — using in-memory data', e); }
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
          const added = (/\.json$/i.test(file.name) || trimmed.startsWith('{') || trimmed.startsWith('['))
            ? importJSON(text) : importBookmarksHTML(text);
          showToast(added > 0 ? `Imported ${added} new link${added === 1 ? '' : 's'}.` : 'No new links (all duplicates).');
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
                    dirty: new Set(), deletes: new Map(), pulling: false };

    function cloudMarkDirty(id)   { if (!cloud.mode || cloud.suspend) return; cloud.dirty.add(String(id)); cloud.deletes.delete(String(id)); }
    function cloudMarkDeleted(id) { if (!cloud.mode || cloud.suspend) return; id = String(id); cloud.dirty.delete(id); cloud.deletes.set(id, Date.now()); persistDeletes(); }
    function persistDeletes()     { if (_db) _db.transaction('meta', 'readwrite').objectStore('meta').put({ key: 'pendingDeletes', value: [...cloud.deletes.entries()] }); }

    async function cloudInit() {
      let res;
      try { res = await fetch('/api/me', { headers: { Accept: 'application/json' } }); }
      catch (e) { return; }                              // no backend -> stay local
      if (res.status === 404) return;                    // not the Worker (plain static host)
      let data = null; try { data = await res.json(); } catch (e) {}
      if (!res.ok || !data || !data.user) { renderAccountUI(); return; }   // signed out
      cloud.user = data.user; cloud.mode = true;
      const pd = await idbGet('meta', 'pendingDeletes');
      if (pd && Array.isArray(pd.value)) pd.value.forEach(([id, ts]) => cloud.deletes.set(String(id), ts));
      await cloudSync(true);                              // full merge on login
      renderAccountUI();
      // Keep devices converged: pull on focus and on a slow interval.
      window.addEventListener('focus', () => cloudSync(false));
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
        const res = await fetch('/api/sync?since=' + since);
        if (!res.ok) return;
        const d = await res.json();
        cloud.suspend = true;
        (d.items || []).forEach(row => {
          const local = items.find(i => sameId(i.id, row.id));
          if (row.deleted) {
            if (local && (local.updatedAt || 0) <= row.updatedAt) removeItemLocal(row.id);
          } else if (row.data) {
            if (!local || (local.updatedAt || 0) < row.updatedAt) upsertItemLocal(row.data);
          }
        });
        if (d.settings && d.settings.blob && (d.settings.updatedAt || 0) > cloud.settingsSyncedAt && !cloud.settingsDirty) {
          hydrateSettings(d.settings.blob);
          cloud.settingsSyncedAt = d.settings.updatedAt;
        }
        cloud.suspend = false;
        if (d.now) cloud.lastSync = d.now;
        // First login from this device: push everything local so the server
        // gets anything it didn't already have (per-row merge makes this safe).
        if (full) {
          items.forEach(i => cloud.dirty.add(String(i.id)));
          if (!d.settings || !d.settings.blob) cloud.settingsDirty = true;
        }
        refresh();
        await cloudPushNow();
      } catch (e) { cloud.suspend = false; }
      finally { cloud.pulling = false; }
    }

    function removeItemLocal(id) {
      items = items.filter(i => !sameId(i.id, id));
      if (_db) _db.transaction('links', 'readwrite').objectStore('links').delete(id);
    }
    function upsertItemLocal(data) {
      if (!data || data.id == null) return;
      const idx = items.findIndex(i => sameId(i.id, data.id));
      if (idx >= 0) items[idx] = data; else items.push(data);
      if (_db) _db.transaction('links', 'readwrite').objectStore('links').put(data);
    }

    function settingsSnapshot() {
      return {
        customProjects,
        priorityProjects: [...priorityProjects],
        projectParent,
        projectCollapsed: [...projectCollapsed],
        tagOrder, projectMeta
      };
    }
    function hydrateSettings(b) {
      if (!b || typeof b !== 'object') return;
      if (Array.isArray(b.customProjects)) customProjects = b.customProjects;
      if (Array.isArray(b.priorityProjects)) priorityProjects = new Set(b.priorityProjects);
      if (b.projectParent && typeof b.projectParent === 'object') projectParent = b.projectParent;
      if (Array.isArray(b.projectCollapsed)) projectCollapsed = new Set(b.projectCollapsed);
      if (Array.isArray(b.tagOrder)) tagOrder = b.tagOrder;
      if (b.projectMeta && typeof b.projectMeta === 'object') projectMeta = b.projectMeta;
    }
    function cloudSchedulePush() {
      if (!cloud.mode || cloud.suspend) return;
      clearTimeout(cloud.timer);
      cloud.timer = setTimeout(cloudPushNow, 800);
    }
    async function cloudPushNow() {
      if (!cloud.mode) return;
      const dirtyIds = [...cloud.dirty];
      const delEntries = [...cloud.deletes.entries()];
      const settingsDirty = cloud.settingsDirty;
      if (!dirtyIds.length && !delEntries.length && !settingsDirty) return;
      // Build the full change list, then send it in bounded batches so a large
      // library (e.g. a first-login push of 100k+ items) never exceeds the
      // worker's per-request cap. Each batch clears only the ids it confirmed.
      const changes = [];
      dirtyIds.forEach(id => { const it = items.find(i => sameId(i.id, id)); if (it) changes.push({ id: String(it.id), data: it, updatedAt: it.updatedAt || Date.now() }); });
      delEntries.forEach(([id, ts]) => changes.push({ id, deleted: 1, updatedAt: ts }));
      const CHUNK = 500;
      let settingsSent = false;
      try {
        let i = 0;
        do {
          const batch = changes.slice(i, i + CHUNK);
          const body = { items: batch };
          if (settingsDirty && !settingsSent) body.settings = { blob: settingsSnapshot(), updatedAt: Date.now() };
          const res = await fetch('/api/sync', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          if (!res.ok) return;   // keep remaining dirty ids for the next attempt
          const d = await res.json().catch(() => null);
          if (d && d.now) cloud.lastSync = d.now;
          batch.forEach(ch => { if (ch.deleted) cloud.deletes.delete(ch.id); else cloud.dirty.delete(ch.id); });
          if (body.settings) { cloud.settingsDirty = false; cloud.settingsSyncedAt = body.settings.updatedAt; settingsSent = true; }
          persistDeletes();
          i += CHUNK;
        } while (i < changes.length);
      } catch (e) {}
    }
    function beginLogin(provider) { location.href = '/api/auth/' + provider + '/login'; }
    async function cloudLogout() {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
      location.reload();
    }
    function openLogin()  { const o = document.getElementById('loginOverlay'); if (o) o.classList.add('show'); }
    function closeLogin() { const o = document.getElementById('loginOverlay'); if (o) o.classList.remove('show'); }

    function renderAccountUI() {
      const row = document.querySelector('.profile-row');
      if (!row) return;
      const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      if (cloud.user) {
        const u = cloud.user;
        const initials = (u.name || u.email || 'U').trim().slice(0, 1).toUpperCase();
        const av = u.avatar
          ? `<img class="profile-av" src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">`
          : `<div class="profile-av">${esc(initials)}</div>`;
        row.innerHTML = av +
          `<div class="profile-text"><span class="profile-name">${esc(u.name || 'Account')}</span>` +
          `<span class="profile-sub">${esc(u.email || 'Synced to cloud')}</span></div>` +
          `<button class="profile-logout" title="Sign out" aria-label="Sign out" onclick="cloudLogout()">` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></button>`;
      } else {
        row.innerHTML =
          `<div class="profile-av">?</div>` +
          `<div class="profile-text"><span class="profile-name">Not signed in</span>` +
          `<span class="profile-sub">Local only</span></div>` +
          `<button class="profile-login" onclick="openLogin()">Sign in</button>`;
      }
    }

    initDropImport();
    initStore().then(cloudInit);

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
        const it = items.find(i => i.id === draggedItemId);
        if (it) { it.project = name; dbPut(it); refresh(); }
      }
    }

    // --- window bridge: expose functions used by inline HTML on* handlers ---
    // app.js is an ES module (own scope); inline handlers run in global scope,
    // so every handler referenced from markup or generated template strings must
    // be published on window. Keep this list in sync with inline on* attributes.
    Object.assign(window, {
      addNewProject, addSubfolder, addTagToItem, applyOrganize, archiveHealthSelected,
      askCancel, askOk, beginLogin, clearFolderCustomize, clearMainSearch, clearRecentWindow,
      closeFolderCustomize, closeHeaderMenu, closeHealth, closeLogin, closeNav, closeOrganize,
      closeSettings, closeShortcuts, closeTagsModal, closeCmdk, cloudLogout, cmdkHover, cmdkKey, cmdkRun,
      collapseAllFolders, confirmReclassify, confirmSuggested, deleteItem, deleteProject,
      dismissSuggested, expandAllFolders, exportHTML, exportJSON, filterProject, filterTag,
      handleImportFile, handleInput, handleNoteKey, markOpened, navBack, navForward,
      onTagsSearch, openFolderCustomize, openHealth, openLogin, openSettings, pickSort, removeHealthSelected, removeTag,
      renameProject, renderCmdk, rootDragOver, rootDrop, runHealthCheck, setFolderColor,
      setFolderIcon, setPrivacyMode, setRecentWindow, setTagMode, setTheme, setView, sfChipDragOver, sfChipDrop,
      showAll, showPinned, showRecent, toggleCollapse, toggleHeaderMenu, toggleHealthSelectAll,
      toggleNav, toggleOrganizeSelectAll, togglePin, togglePriority, toggleSection, toggleSidebar,
      toggleSortMenu, updateNote, unnestProject, dbPut, refresh
    });
