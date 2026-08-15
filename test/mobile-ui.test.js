import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const boot = fs.readFileSync(new URL('../src/boot.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const landingCss = fs.readFileSync(new URL('../src/landing-theme.css', import.meta.url), 'utf8');
const settingsMarkup = html.slice(html.indexOf('id="settingsOverlay"'), html.indexOf('id="logoutOverlay"'));
const finalSettingsCss = css.slice(css.lastIndexOf('/* Settings — Graphite source list'));

test('mobile dock keeps primary library actions thumb-reachable', () => {
  assert.match(html, /class="mobile-tabbar"/);
  for (const label of [
    'Open library navigation',
    'Search library',
    'Save a new link',
    'Ask My Library',
    'Open settings'
  ]) assert.match(html, new RegExp(`aria-label="${label}"`));
  assert.match(html, /id="mobileLibraryToggle"[^>]*aria-current="page"/);
  assert.match(app, /button\.removeAttribute\('aria-current'\)/);
  assert.match(app, /activeButton\?\.setAttribute\('aria-current', 'page'\)/);
});

test('mobile library drawer is labelled, modal to background content, and keyboard contained', () => {
  assert.match(html, /<aside id="libraryDrawer" aria-label="Library navigation" tabindex="-1">/);
  assert.match(html, /id="navToggle"[^>]*aria-controls="libraryDrawer"[^>]*aria-expanded="false"/);
  assert.match(html, /id="mobileLibraryToggle"[^>]*aria-controls="libraryDrawer"[^>]*aria-expanded="false"/);
  assert.match(html, /id="sidebarToggle"[^>]*aria-controls="libraryDrawer"[^>]*aria-expanded="true"/);
  assert.match(app, /let mobileDrawerReturnFocus = null/);
  assert.match(app, /element\.inert = true/);
  assert.match(app, /document\.getElementById\('main-content'\), document\.querySelector\('\.mobile-tabbar'\)/);
  assert.match(app, /document\.getElementById\('sidebarToggle'\) \|\| mobileDrawerFocusable\(\)\[0\]/);
  assert.match(app, /returnTarget && returnTarget\.isConnected \? returnTarget : fallback/);
  assert.match(app, /if \(e\.key === 'Escape'\)[\s\S]*?closeNav\(\)/);
  assert.match(app, /if \(e\.key !== 'Tab'\) return/);
  assert.match(app, /const last = focusable\[focusable\.length - 1\]/);
  assert.match(app, /e\.shiftKey && \(active === first \|\| active === drawer\)/);
  assert.match(app, /!e\.shiftKey && active === last/);
});

test('mobile tag filters close the drawer and expose the filtered result', () => {
  assert.match(app, /function filterTag\(tag\)[\s\S]*?tag = String\(tag \|\| ''\)\.trim\(\)/);
  assert.match(app, /if \(isMobileNav\(\)\) closeNav\(\{ restoreFocus: false \}\);[\s\S]*?refresh\(\)/);
  assert.match(app, /scroller\.scrollTop = 0/);
  assert.match(app, /`#\$\{tag\} · \$\{_visible\.length\} link/);
  assert.match(app, /el\.setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(app, /el\.setAttribute\('aria-label', `\$\{active \? 'Remove' : 'Filter by'\} tag/);
});

test('header Search and Ask always use the complete library', () => {
  assert.match(app, /Header search is library-wide by design/);
  assert.match(app, /if \(raw\) \{\s*activeFilter = null;\s*activeTags = \[\];\s*pinnedView = false;\s*recentView = false;/);
  assert.match(app, /Keep the folder tree stable and visible;[\s\S]*?projectQuery = '';/);
  assert.doesNotMatch(app, /projectQuery = raw\.toLowerCase\(\)/);
  assert.match(app, /fetch\('\/api\/library\/ask'[\s\S]*?body: JSON\.stringify\(\{ question \}\)/);
  assert.doesNotMatch(app, /JSON\.stringify\(\{ question, (?:project|folder|tags)/);
});

test('local search keeps multilingual movie and TV concepts narrow', () => {
  assert.match(app, /import \{ conceptAliasesForToken, normalizeSearchConcept \} from '\.\/search-concepts\.js';/);
  assert.match(app, /function _conceptScore\(token, text\)/);
  assert.match(app, /for \(const alias of conceptAliasesForToken\(normalized\)\)/);
  assert.match(app, /const s = _conceptScore\(tok, _itemFieldText\(it, f\)\)/);
  assert.match(app, /every query word must still match/i);
});

test('cloud sync adopts remote ids by normalized URL and rendering never exposes duplicate rows', () => {
  assert.match(app, /function refresh\(\) \{[\s\S]*?consolidateStoredDuplicates\(\);[\s\S]*?renderItems\(getVisibleItems\(\)\)/);
  assert.match(app, /function consolidateStoredDuplicates\(force = false\)/);
  assert.match(app, /const normalized = normalizeUrl\(data\.url\)/);
  assert.match(app, /items\.findIndex\(item => item\.url && normalizeUrl\(item\.url\) === normalized\)/);
  assert.match(app, /const merged = consolidateDuplicateLinks\(\[previous, data\]\)\.items\[0\]/);
  assert.match(app, /merged\.id = data\.id/);
  assert.match(app, /store\.delete\(previous\.id\)/);
});

test('opening a folder clears stale tag and search filters while explicit folder tags still compose', () => {
  assert.match(app, /function filterProject\(projectName\)[\s\S]*?const hasTransientFilters = activeTags\.length > 0 \|\| !!searchQuery;[\s\S]*?const openingFolder = activeFilter !== projectName \|\| hasTransientFilters;[\s\S]*?if \(openingFolder\) \{[\s\S]*?activeTags = \[\];[\s\S]*?resetMainSearchState\(\);/);
  assert.match(app, /function filterTag\(tag\)[\s\S]*?activeTags\.push\(tag\);/);
  assert.match(app, /folderTagMismatch[\s\S]*?Clear tag filters/);
});

test('app dialogs share one stacked focus manager and restore the opener', () => {
  assert.match(app, /const modalFocusStack = \[\]/);
  assert.match(app, /function reconcileModalFocus\(\)/);
  assert.match(app, /new MutationObserver\(records =>/);
  assert.match(app, /attributeFilter: \['class'\]/);
  assert.match(app, /modalBackgroundInertState = new Map/);
  assert.match(app, /targets\.forEach\(element => \{ element\.inert = true; \}\)/);
  assert.match(app, /entry\.overlay\.inert = !isTop/);
  assert.match(app, /entry\.overlay\.setAttribute\('aria-hidden', isTop \? 'false' : 'true'\)/);
  assert.match(app, /restoreModalFocus\(closingTop\.opener\)/);
  assert.match(app, /event\.key === 'Escape'[\s\S]*?event\.stopImmediatePropagation\(\)[\s\S]*?top\.overlay\.click\(\)/);
  assert.match(app, /event\.key !== 'Tab'[\s\S]*?const first = focusable\[0\][\s\S]*?const last = focusable\[focusable\.length - 1\]/);
  assert.equal((html.match(/class="modal-overlay(?: [^"]+)?"[^>]*aria-hidden="true"/g) || []).length, 12);
});

test('smart search actions and mobile dock expose their actual control semantics', () => {
  assert.match(html, /id="smartSearchActions" role="group" aria-label="Smart search actions"/);
  assert.doesNotMatch(html, /id="smartSearchActions" role="listbox"/);
  for (const [buttonId, overlayId] of [
    ['mobileSaveTab', 'saveLinkOverlay'],
    ['mobileAskTab', 'libraryAskOverlay'],
    ['mobileSettingsTab', 'settingsOverlay']
  ]) {
    assert.match(html, new RegExp(`id="${buttonId}"[^>]*aria-controls="${overlayId}"[^>]*aria-expanded="false"`));
  }
  assert.match(app, /const MOBILE_DOCK_DIALOGS = new Map/);
  assert.match(app, /button\.setAttribute\('aria-expanded', expanded \? 'true' : 'false'\)/);
  assert.match(app, /activeButton\?\.classList\.add\('active'\)/);
});

test('mobile browser chrome follows the computed active theme surface', () => {
  assert.match(app, /function updateAppThemeColor\(\)/);
  assert.match(app, /isMobileNav\(\) \? document\.querySelector\('#appShell header'\) : document\.getElementById\('libraryDrawer'\)/);
  assert.match(app, /window\.getComputedStyle\(surface\)\.backgroundColor/);
  assert.match(app, /themeMeta\.content = color/);
  assert.doesNotMatch(app, /const browserChrome =/);
  assert.match(css, /\.nav-item\.drag-over \{[\s\S]*?color: var\(--nav-active-text\) !important;/);
});

test('dynamic folder rows use adjacent native controls without nesting buttons', () => {
  assert.doesNotMatch(app, /div\.onclick = \(\) => filterProject\(projectName\)/);
  assert.match(app, /<button[^>]*class="project-open"[^>]*draggable="true"[^>]*onclick="filterProject/);
  assert.match(app, /branchActive \? ' aria-current="page"' : ''/);
  assert.doesNotMatch(app, /class="proj-caret/);
  assert.match(app, /aria-label="Customize \$\{htmlAttr\(folderName\(projectName\)\)\}"/);
  assert.match(app, /aria-pressed="\$\{isPriority \? 'true' : 'false'\}"/);
  assert.match(css, /\.project-open \{[\s\S]*?display: flex;[\s\S]*?background: transparent;[\s\S]*?color: inherit;/);
});

test('desktop app uses the final dark Finder frame while mobile keeps full width', () => {
  assert.match(css, /Chrono-inspired application shell/);
  assert.match(css, /--app-background:\s*#12141d/);
  assert.match(css, /Final Finder release layer[\s\S]*?background:\s*var\(--app-background\)/);
  assert.match(css, /body\.app-active \{ padding: 14px; gap: 0; \}/);
  assert.match(css, /body\.app-active \{ padding: 0; background: var\(--content-background\); \}/);
});

test('landing uses the current sl-theme structure and direct application routes', () => {
  assert.match(html, /<div class="sl-theme">/);
  assert.match(html, /<main id="landing-main">/);
  assert.match(html, /<nav class="nav">/);
  for (const href of ['#search', '#features', '#ask', '/privacy/']) {
    assert.match(html, new RegExp(`href="${href}"`));
  }
  assert.ok((html.match(/href="\/app"/g) || []).length >= 2, 'landing should expose more than one direct app CTA');
  assert.match(html, /href="\/app#import"/);
  assert.match(html, /<section class="sec" id="extensions">/);
  assert.doesNotMatch(html, /\blp5-/);
});

test('landing has a resilient theme load path and mobile-safe layout contracts', () => {
  assert.match(boot, /import\s+['"]\.\/landing-theme\.css['"]\s*;/);
  assert.match(landingCss, /body\.landing-active:not\(\.app-active\) #landingPage\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(landingCss, /@media\s*\(max-width:\s*600px\)[\s\S]*?\.extension-links\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(landingCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.reveal[\s\S]*?transition:\s*none/);
  assert.match(landingCss, /\.sl-theme\s*:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--amber\)/);
});

test('landing social actions remain visible and safely open external sharing pages', () => {
  const socialBlock = html.slice(html.indexOf('class="socials"'), html.indexOf('</div>', html.indexOf('class="socials"')));
  assert.match(socialBlock, /aria-label="Share saveto\.me"/);
  for (const network of ['X', 'Facebook', 'LinkedIn', 'Reddit', 'WhatsApp', 'Telegram']) {
    assert.match(socialBlock, new RegExp(`aria-label="Share saveto\\.me on ${network}"`));
  }
  assert.equal((socialBlock.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 6);
  assert.match(landingCss, /\.socials\s*\{[\s\S]*?display:\s*flex/);
  const finalMobileLanding = landingCss.slice(landingCss.lastIndexOf('@media (max-width: 600px)'));
  assert.match(finalMobileLanding, /\.sl-theme \.socials\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(44px,\s*1fr\)\)/);
  assert.match(finalMobileLanding, /\.sl-theme \.socials a \{ min-height: 46px; \}/);
});

test('landing authentication waits for identity and behaves as a contained modal', () => {
  assert.match(html, /<meta name="theme-color" content="#212121">/i);
  assert.match(html, /id="landingAuthOverlay" aria-hidden="true" inert/);
  assert.match(html, /class="landing-auth-card" role="dialog" aria-modal="true"/);
  assert.match(boot, /document\.querySelector\('\.sl-theme \.nav-shell'\)/);
  assert.match(boot, /let authStatus = 'loading'/);
  assert.match(boot, /const authReady = fetch\('\/api\/me'/);
  assert.match(boot, /document\.querySelectorAll\('\.landing-page a\[href\^="\/app"\]'\)/);
  assert.match(boot, /const signedIn = await authReady/);
  assert.match(boot, /overlay\.inert = false/);
  assert.match(boot, /setBackgroundInert\(true\)/);
  assert.match(boot, /if \(event\.key !== 'Tab'\) return/);
  assert.match(boot, /const last = focusable\[focusable\.length - 1\]/);
  assert.match(boot, /target\?\.isConnected[\s\S]*target\.focus\(\)/);
  assert.match(css, /@media \(max-width: 620px\) \{[\s\S]*?body\.landing-active \.landing-auth-card \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
});

test('desktop header keeps search and utility controls compact', () => {
  assert.match(css, /body\.app-active #appShell header \{[\s\S]*?min-height: 58px;[\s\S]*?height: 58px;/);
  assert.match(css, /header \.search-bar \{ width: min\(48vw, 580px\); max-width: 580px; \}/);
  assert.match(css, /header \.search-input \{ height: 36px;/);
  assert.match(css, /header \.settings-btn \{ width: 36px; height: 36px; min-height: 36px; \}/);
  assert.match(css, /header \.view-btn-icon \{ width: 30px; height: 28px;/);
});

test('sidebar section labels are compact and workspace uses a theme-aware dot pattern', () => {
  assert.match(css, /#appShell aside \.section-title \{[\s\S]*?font-size: 8\.75px;/);
  assert.match(css, /#appShell aside \.nav-section \{ margin-bottom: 10px; \}/);
  assert.match(css, /#appShell aside \.nav-item \{[\s\S]*?min-height: 34px;/);
  assert.match(css, /Subtle paper-dot workspace texture/);
  assert.match(css, /radial-gradient\(circle, color-mix\(in srgb, var\(--text-muted\) 12%, transparent\)/);
  assert.match(css, /0 0 \/ 6px 6px/);
});

test('Recently Added shows the true total and offers an explicit show-all action', () => {
  assert.match(app, /rc\.innerText = items\.filter\(i => !i\.archived\)\.length/);
  assert.match(app, /Showing \$\{shown\} newest of \$\{total\}/);
  assert.match(app, /toggleRecentShowAll\(\)/);
  assert.match(app, /recentShowAll \? out : out\.slice\(0, RECENT_LIMIT\)/);
  assert.match(app, /sf-head sf-head-smart/);
  assert.match(app, /Recently Added<\/span><span class="sf-pcrumb-count">\$\{total\}/);
  assert.doesNotMatch(app, /sf-badge sf-badge-recent/);
  assert.doesNotMatch(app, /title="Back to all links"/);
  assert.match(css, /\.sf-head-smart \{[\s\S]*?min-height:\s*24px/);
});

test('mobile inline handlers are exposed and responsive styles are present', () => {
  assert.match(app, /focusLibrarySearch,/);
  for (const handler of ['openLogin', 'openNav', 'openSettings']) assert.match(app, new RegExp(`\\b${handler}\\b`));
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.mobile-tabbar/);
  assert.match(css, /\.item-mobile-domain/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /column-count:\s*2/);
  assert.match(css, /min-height:\s*calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(app, /scroller\.scrollTop = 0/);
  assert.match(html, /id="saveLinkOverlay"/);
  assert.match(html, /onclick="openSaveLink\(\)" aria-label="Save a new link"/);
  assert.match(app, /openSaveLink,/);
  assert.match(app, /Object\.assign\(window, \{[\s\S]*?\bclearTags,\s*confirmReclassify/);
});

test('settings are split into focused categories', () => {
  for (const category of ['intelligence', 'data', 'capture', 'health', 'privacy']) {
    assert.match(html, new RegExp(`data-settings-tab="${category}"`));
    assert.match(html, new RegExp(`data-settings-panel="${category}"`));
  }
  assert.match(app, /function setSettingsCategory\(category, options = \{\}\)/);
  assert.match(app, /const SETTINGS_CATEGORIES = \['intelligence', 'data', 'capture', 'health', 'privacy'\]/);
  assert.match(app, /function openSettings\(category = ''\)/);
  assert.match(app, /const requestedCategory = SETTINGS_CATEGORIES\.includes\(category\) \? category : ''/);
  assert.match(app, /setSettingsCategory\(requestedCategory \|\| 'intelligence', \{ openCategory: !!requestedCategory \}\)/);
  assert.match(app, /if \(!SETTINGS_CATEGORIES\.includes\(category\)\) category = 'intelligence'/);
  assert.match(app, /function acceptOnboardingImport\(\) \{[\s\S]*?openSettings\('data'\)/);
  assert.match(app, /label: 'Import \/ export'[\s\S]*?openSettings\('data'\)/);
  assert.match(html, /data-settings-panel="health"[\s\S]*Open Health Checker/);
  assert.doesNotMatch(html, /class="hmenu-item"[^>]*openHealth/);
  assert.match(html, /id="settings-tab-health"[^>]*aria-controls="settings-panel-health"[^>]*onkeydown="onSettingsTabKey\(event\)"/);
  assert.match(html, /id="settings-panel-health"[^>]*aria-labelledby="settings-tab-health"/);
  assert.match(app, /function onSettingsTabKey\(event\)/);
  assert.match(app, /ArrowRight'[\s\S]*?ArrowLeft'[\s\S]*?Home'[\s\S]*?End'/);
  assert.match(html, /class="settings-browser"/);
  assert.match(html, /class="settings-content"/);
  assert.match(html, /class="settings-mobile-back"[^>]*onclick="showSettingsDirectory\(\)"/);
  assert.match(finalSettingsCss, /\.settings-modal > \.modal-head \{[\s\S]*?width:\s*308px/);
  assert.match(finalSettingsCss, /\.settings-browser \{[\s\S]*?grid-template-columns:\s*308px minmax\(0, 1fr\)/);
  assert.match(finalSettingsCss, /@media \(max-width: 700px\)[\s\S]*?\.settings-content \{ display: none;/);

  for (const className of ['settings-tab-icon', 'settings-panel-icon', 'settings-card-icon']) {
    const icons = settingsMarkup.match(new RegExp('<[^>]+class="' + className + '"[^>]*>', 'g')) || [];
    assert.ok(icons.length > 0, className + ' should exist');
    assert.ok(icons.every(icon => /aria-hidden="true"/.test(icon)), className + ' must stay decorative');
  }
});

test('narrow phones retain sorting and folder actions', () => {
  assert.match(html, /id="mobileSortSelect" aria-label="Sort links" onchange="pickSort\(this\.value\)"/);
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*?\.hmenu-mobile-sort-wrap \{[\s\S]*?display: grid;/);
  assert.match(css, /@media \(max-width: 390px\)[\s\S]*?\.sf-actions \{[^}]*display: flex;/);
  assert.doesNotMatch(css, /@media \(max-width: 390px\)[\s\S]{0,300}?\.sf-actions \{ display: none; \}/);
  assert.match(css, /\.sf-act \{ width: 44px; height: 44px; flex-basis: 44px; \}/);
});

test('mobile focus, active search, and touch targets remain visible', () => {
  assert.match(css, /--focus-ring: var\(--border-focus\)/);
  assert.match(css, /:where\(button, a, input, textarea, select, \[tabindex\]\):focus-visible \{\s*outline: 3px solid var\(--focus-ring\)/);
  assert.match(css, /header \.search-mode-btn\.active \{\s*border-color: var\(--brand-primary\);\s*background: var\(--brand-soft\);\s*color: var\(--brand-text\);/);
  assert.match(css, /aside :where\(\.section-header, \.nav-item\) \{ min-height: 44px; \}/);
  assert.match(css, /\.fc-color\.on \{ outline: 3px solid var\(--text-main\); outline-offset: 2px; \}/);
});

test('settings actions share one theme-aware button palette', () => {
  assert.match(css, /\.settings-modal \.settings-card-actions \.modal-btn\s*\{/);
  assert.match(css, /background:\s*var\(--brand-primary\)/);
  assert.match(css, /color:\s*var\(--on-brand\)/);
  const finalPrimary = css.lastIndexOf('html body.app-active .settings-modal .modal-btn.primary,');
  assert.notEqual(finalPrimary, -1);
  const declarations = css.slice(finalPrimary, css.indexOf('}', finalPrimary));
  assert.match(declarations, /background:\s*#F4511E/);
  assert.match(declarations, /color:\s*#212121/);
});

test('application exposes only the Graphite Orange production theme', () => {
  assert.doesNotMatch(html, /id="themeSwatches"|class="theme-swatch"|data-theme=/);
  assert.match(app, /const LEGACY_THEME_CLASSES = Array\.from\(document\.documentElement\.classList\)/);
  assert.match(app, /html\.classList\.add\('theme-orange'\)/);
  assert.match(app, /function currentTheme\(\) \{ return 'orange'; \}/);
  assert.doesNotMatch(app, /Toggle dark mode|setTheme\('(?:light|dark|reply|cyan)'\)/);
  assert.doesNotMatch(css, /html\.(?:dark|theme-(?:reply|cyan|red|black|mint|lilac|warm))\b/);
  assert.match(css, /Single production palette: Graphite Orange/);
  assert.match(css, /body\.app-active \.header-menu-dropdown \{ width: min\(292px, calc\(100vw - 16px\)\); min-width: 0; \}/);
  assert.match(app, /eWrap\.style\.setProperty\('--folder-preview', previewColor/);
  assert.match(app, /aria-label="Use \$\{key\} folder icon" aria-pressed="\$\{meta\.icon === key \? 'true' : 'false'\}"/);
  assert.match(css, /\.fc-icon \{[\s\S]*?color: color-mix\(in srgb, var\(--folder-preview, var\(--brand-primary\)\) 40%, var\(--text-main\)\)/);
  assert.match(css, /\.fc-icon svg \{[^}]*color: inherit; stroke: currentColor;/);
  assert.match(app, /class="fc-color\$\{projectColor\(name\) === col \? ' on' : ''\}"/);
  assert.match(app, /aria-pressed="\$\{projectColor\(name\) === col \? 'true' : 'false'\}"/);
  assert.match(app, /div\.classList\.add\('has-folder-accent'\)/);
  assert.match(css, /nav-item\.has-folder-accent \.nav-icon \{ color: color-mix\(in srgb, var\(--folder-accent\) 40%, var\(--nav-text\)\) !important; \}/);
  assert.match(app, /class="sf-badge\$\{isPri \? ' pri' : ''\}\$\{curAccent \? ' has-folder-accent' : ''\}"/);
  assert.match(css, /\.sf-badge\.has-folder-accent \{[\s\S]*?var\(--folder-accent\)/);
  assert.match(app, /class="finder-folder-icon\$\{accent \? ' has-folder-accent' : ''\}"/);
  assert.match(css, /\.finder-folder-icon\.has-folder-accent \{[\s\S]*?var\(--folder-accent\)/);
  assert.match(css, /\.link-item \{[\s\S]*?--card-accent-visible: color-mix\(in srgb, var\(--card-accent\) 40%, var\(--text-main\)\)/);
});

test('compact list uses one flat Finder table instead of card rows', () => {
  assert.match(app, /if \(currentLayout === 'list' && renderFinderList\(itemList\)\) return/);
  assert.match(app, /class="finder-table" role="table"/);
  assert.match(css, /\.finder-table\s*\{/);
  assert.match(css, /\.finder-header,[\s\S]*?\.finder-row\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /\.finder-row\s*\{[\s\S]*?min-height:\s*(?:3[8-9]|4[0-4])px/);
  assert.match(css, /\.finder-row:hover\s*\{[\s\S]*?background:\s*var\(--bg-subtle\)/);
});

test('Ask answers expose direct safe source links without citation-number clutter', () => {
  assert.match(app, /className = 'library-answer-sources'/);
  assert.match(app, /className = 'library-answer-source'/);
  assert.match(app, /link\.href = safeHttpUrl\(source\.url\)/);
  assert.match(app, /\.slice\(0, 3\)/);
  assert.doesNotMatch(app, /Sources from your library/);
});

test('sign out always syncs and removes the private local copy', () => {
  assert.match(html, /id="logoutOverlay"/);
  assert.match(html, /onclick="cloudLogout\(\)"/);
  assert.doesNotMatch(html, /cloudLogout\((?:false|true)\)/);
  assert.match(html, /Sign out completely/);
  assert.match(app, /indexedDB\.deleteDatabase\(DB_NAME\)/);
  assert.match(app, /Some local changes could not be synced\. Local data was not removed\./);
  assert.match(app, /Sync and sign out/);
  assert.match(app, /onclick="openLogoutOptions\(\)"/);
});

test('cached account identity renders before the first full cloud sync', () => {
  assert.match(app, /const ACCOUNT_PREVIEW_KEY = 'savemeAccountPreviewV1'/);
  assert.match(app, /saveAccountPreview\(data\.user\);\s*renderAccountUI\(\);\s*\/\/ identity is visible before the first full sync/);
  assert.match(app, /const visibleUser = cloud\.user \|\| accountPreview/);
  assert.match(app, /Checking sign-in…/);
  assert.match(app, /clearAccountPreview\(\);\s*await deleteLocalLibraryDatabase\(\)/);
});

test('cloud sync retries safely and gives the user a direct retry action', () => {
  assert.match(app, /function scheduleCloudRetry\(\)/);
  assert.match(app, /const delays = \[3_000, 10_000, 30_000, 60_000, 120_000\]/);
  assert.match(app, /window\.addEventListener\('online', \(\) => retryCloudSync\(\)\)/);
  assert.match(app, /function prepareItemForSync\(item\)/);
  assert.match(app, /\['autoTags', 'suggestedTags'\]/);
  assert.match(app, /class="profile-sub profile-sync-retry"/);
  assert.match(app, /retryCloudSync, dbPut, refresh/);
  assert.match(css, /\.profile-sync-retry \{/);
});

test('cloud push preserves edits and tombstones created while a request is in flight', () => {
  assert.match(app, /const sentSnapshots = new Map\(\)/);
  assert.match(app, /kind: 'upsert', revision: cloud\.changeRevisions\.get/);
  assert.match(app, /kind: 'delete', revision: cloud\.changeRevisions\.get/);
  assert.match(app, /if \(!isSyncSnapshotCurrent\(sent, current\)\) return/);
  assert.match(app, /cloud\.settingsRevision === settingsRevision/);
  assert.doesNotMatch(app, /batch\.forEach\(ch => \{ if \(ch\.deleted\) cloud\.deletes\.delete/);
});

test('settings expose a guarded permanent account deletion flow', () => {
  assert.match(html, /id="deleteAccountBtn"[^>]*onclick="deleteAccountPermanently\(\)"/);
  assert.match(html, /account, cloud library, folders, settings, search index, Ask history/);
  assert.match(app, /typed\.trim\(\) !== 'DELETE MY ACCOUNT'/);
  assert.match(app, /fetch\('\/api\/account'/);
  assert.match(app, /savemePendingAccountPurge/);
  assert.match(app, /deleteAccountPermanently,/);
});

test('header uses one smart input for search, save, and Ask', () => {
  assert.match(html, /id="smartSearchActions"/);
  for (const action of ['search', 'save', 'ask']) assert.match(html, new RegExp(`data-smart-action="${action}"`));
  assert.doesNotMatch(html, /class="save-link-header-btn"/);
  assert.doesNotMatch(html, /class="ask-library-btn"/);
  assert.match(app, /function runSmartSearchAction\(action\)/);
  assert.match(app, /value\.endsWith\('\?'\)/);
  assert.match(app, /openLibraryAsk\(question\)/);
});

test('browser import offers predictable folder strategies', () => {
  assert.match(html, /id="importFolderStrategy"/);
  for (const strategy of ['smart', 'preserve', 'inbox']) assert.match(html, new RegExp(`value="${strategy}"`));
  assert.match(app, /const SMART_IMPORT_FOLDERS/);
  assert.match(app, /return 'Inbox'/);
  assert.match(app, /strategy === 'smart'[\s\S]*smartImportProject\(meta\)/);
  assert.match(app, /originalProject: sourceProject \|\| null/);
});

test('browser imports keep their hierarchy under a named browser root', () => {
  assert.match(html, /Keep browser folders — recommended/);
  assert.match(html, /clear browser root/);
  assert.match(html, /id="importBrowserSource"/);
  for (const browser of ['Chrome', 'Safari', 'Firefox', 'Edge', 'Brave', 'Opera', 'Vivaldi']) {
    assert.match(html, new RegExp(`value="${browser}"`));
  }
  assert.match(app, /function browserFavoritesRoot\(sourceName, doc\)/);
  for (const browser of ['Edge', 'Chrome', 'Firefox', 'Safari', 'Brave', 'Opera']) {
    assert.match(app, new RegExp(`'${browser}'`));
  }
  assert.match(app, /return `\$\{browser\} Browser`/);
  assert.match(app, /const tempId = `node_/);
  assert.match(app, /parentTempId: parentTempId \|\| rootTempId/);
  assert.match(app, /folderIdsByTemp\.get\(link\.sourceFolderTempId\)/);
  assert.match(app, /importBookmarksHTML\(text, file\.name\)/);
  assert.match(app, /selected !== 'auto'/);
  assert.match(app, /createFolderEntity\(node\.name, \{ parentId/);
});

test('folder schema uses stable ids and does not key imported hierarchy by display name', () => {
  assert.match(app, /const FOLDER_SCHEMA_VERSION = 3/);
  assert.match(app, /function newFolderId\(\)/);
  assert.match(app, /let folders = \{\}/);
  assert.match(app, /folderId: project/);
  assert.match(app, /A repeated import, or[\s\S]*?must not leave a second empty copy/);
  assert.match(app, /const newIncoming = incoming\.filter/);
  assert.match(app, /if \(!newIncoming\.length\) \{ lastImportBatchId = null; return 0; \}/);
  assert.doesNotMatch(app, /createFolderEntity\(node\.name,[^\n]*reuseSibling: false/);
  assert.doesNotMatch(app, /parentMap\[name\] = parentName/);
  assert.match(app, /function validateFolderGraph\(candidate = folders\)/);
});

test('browser import previews changes and supports batch undo', () => {
  assert.match(app, /function previewImport\(text, filename = ''\)/);
  assert.match(app, /Import cancelled\. Your library was not changed/);
  assert.match(app, /importBatchId/);
  assert.match(app, /function undoImportBatch\(importBatchId\)/);
  assert.match(html, /class="visually-hidden" type="file"/);
  assert.match(html, /type="button" onclick="document\.getElementById\('importFile'\)\.click\(\)"/);
  const importHandler = app.slice(app.indexOf('function handleImportFile(e)'), app.indexOf('function previewImport(text'));
  assert.match(importHandler, /if \(file\.size > 50 \* 1024 \* 1024\)[\s\S]*?e\.target\.value = ''/);
  assert.match(importHandler, /finally \{\s*e\.target\.value = '';\s*\}/);
  assert.match(importHandler, /reader\.onerror = \(\) => \{[\s\S]*?e\.target\.value = ''/);
  assert.match(importHandler, /reader\.onabort = \(\) => \{ setImportWorkflowStep\(0\); e\.target\.value = ''; \}/);
});

test('JSON backup imports preserve their original folder source metadata', () => {
  const normalizeBackup = app.slice(app.indexOf('function normalizeBackupItem('), app.indexOf('function mergeRestoreNotes('));
  assert.match(normalizeBackup, /const item = \{ \.\.\.raw, url: String\(raw\.url\)\.trim\(\) \}/);
  assert.match(normalizeBackup, /item\.folderSource = item\.folderSource \|\| \(folderKind\(targetFolder\) === 'manual' \? 'manual' : folderKind\(targetFolder\)\)/);
  assert.match(normalizeBackup, /item\.importRootId = folderIdMap\.get\(String\(item\.importRootId\)\) \|\| item\.importRootId/);

  const duplicateMerge = app.slice(app.indexOf('function mergeBackupDuplicate('), app.indexOf('function freshRestoreItemId('));
  assert.match(duplicateMerge, /merged\.folderSource = chosenFolder\.folderSource \|\| merged\.folderSource/);
  assert.match(app, /const folderRestore = restoreBackupFolders\(data, sourceItems\)/);
  assert.match(app, /const backup = normalizeBackupItem\(raw, folderRestore\.idMap\)/);
});

test('smart workflows expose organization preview, relevance feedback, related links, and complete export', () => {
  assert.match(app, /function previewOrganizeFromQuery\(question\)/);
  assert.match(app, /Review every move before applying/);
  assert.match(app, /function markSearchNotRelevant\(itemId\)/);
  assert.match(app, /\/api\/library\/search-feedback/);
  assert.match(app, /function openRelatedLinks\(itemId\)/);
  assert.match(html, /class="current" aria-current="step">Upload<\/li><li>Analyze<\/li><li>Preview<\/li><li>Import<\/li>/);
  assert.match(html, />Export library…<\/button>/);
  assert.match(css, /html body\.app-active \.settings-import-flow \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 360px\) \{[\s\S]*?\.settings-import-flow \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('individually saved links use smart folders outside browser-import roots', () => {
  assert.match(app, /requestedProject \|\| activeFilter \|\| chooseProject\(meta, parsedUrl\.hostname\)/);
  assert.match(app, /folderSource: requestedProject \|\| activeFilter \? 'manual' : 'smart'/);
  assert.match(app, /folderSource: activeFilter \? 'manual' : 'smart'/);
  assert.match(app, /folderSource: 'browser-import'/);
});

test('folder headers omit the redundant parent and all-folders action row', () => {
  assert.doesNotMatch(app, /class="sf-folder-nav"/);
  assert.doesNotMatch(app, />Parent folder</);
  assert.doesNotMatch(app, />All folders</);
  assert.doesNotMatch(css, /\.sf-nav-link/);
});

test('folder headers expose only one labeled create-folder action', () => {
  assert.match(app, /class="sf-act sf-act-new"[^>]*aria-label="New folder"[^>]*onclick="addNewProject\(\)"/);
  assert.match(app, /class="sf-act sf-act-new"[^>]*aria-label="Create a subfolder inside \$\{htmlAttr\(folderName\(cur\)\)\}"[^>]*onclick="addSubfolder/);
  assert.doesNotMatch(app, /class="sf-chip sf-add"/);
});

test('folder registry repairs imported links that have no valid folder', () => {
  assert.match(app, /function repairFolderAssignments\(\)/);
  assert.match(app, /item\.project = 'Inbox'/);
  assert.match(app, /\.\.\.customProjects\.filter\(name => name && !obsoleteImportedFolders\.has\(name\)\), \.\.\.itemFolders/);
  assert.match(app, /knownFolders\.has\('Favorites Bar'\).*recoveredBrowserRoot = 'Edge Browser'/);
  assert.match(app, /legacyImportedItems\.every\(item => item\.imported === true\)/);
  assert.match(app, /folderItems\.length && folderItems\.every\(item => item\.imported === true\)/);
  assert.match(app, /for \(const folder of \['travelink\.me', 'APPLE TV'\]\)/);
  assert.match(app, /item\.importRoot = recoveredBrowserRoot/);
  assert.match(app, /projectParent\[name\] = recoveredBrowserRoot/);
  assert.match(app, /repairFolderAssignments\(\);[\s\S]*refresh\(\)/);
  assert.match(app, /const browserRoots = Object\.values\(folders\)\.filter/);
  assert.match(app, /matchingLegacyFolder\(item, root\) \|\| root/);
  assert.match(app, /item\.folderId = target\.id/);
  assert.match(app, /item\.project = target\.id/);
  assert.match(app, /inboxFolder \|\|= folderByName\('Inbox', null\)/);
});

test('legacy root Imported bucket is merged into the single browser Favorites root', () => {
  assert.match(app, /function repairStableImportedBucket\(\)/);
  assert.match(app, /folder\.name === 'Imported' && !folder\.parentId/);
  assert.match(app, /browserRoots\.length !== 1/);
  assert.match(app, /item\.folderSource = 'browser-import'/);
  assert.match(app, /delete folders\[imported\.id\]/);
});

test('existing and future imports use a consistent Browser root name for every browser', () => {
  assert.match(app, /function migrateBrowserRootNames\(\)/);
  for (const browser of ['Edge', 'Chrome', 'Safari', 'Firefox', 'Brave', 'Opera', 'Vivaldi']) {
    assert.match(app, new RegExp(`'${browser} Favorites': '${browser} Browser'`));
  }
  assert.match(app, /'Browser Favorites': 'Other Browser'/);
  assert.match(app, /return `\$\{browser\} Browser`/);
});

test('sidebar and header use flat panels in all supported modes', () => {
  assert.match(css, /Flat application chrome/);
  assert.match(css, /#appShell aside,[\s\S]*#appShell header[\s\S]*background-image: none !important/);
  assert.match(css, /#appShell header \.search-input:focus[\s\S]*box-shadow: none/);
  assert.match(css, /#appShell aside \.brand-mark::before \{ display: none; \}/);
  assert.match(css, /body\.nav-open #appShell aside \{ box-shadow: none; \}/);
  assert.match(css, /Unified workspace frame/);
  assert.match(css, /body\.app-active #appShell aside,[\s\S]*body\.app-active #appShell header \{ border: 0; \}/);
  assert.match(css, /body\.app-active #appShell \.content-scroll[\s\S]*border-radius: 16px/);
  assert.match(css, /body\.sidebar-collapsed\.app-active #appShell :where\(\.fav-empty, \.tag-empty\) \{ display: none; \}/);
  const chromeRule = css.match(/#appShell aside,\s*#appShell header \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.doesNotMatch(chromeRule, /(?:^|\n)\s*--nav-(?:bg|panel|border|text|active)[^:]*:/);
  assert.match(css, /html body\.app-active \{[\s\S]*?--nav-bg: #212121/);
  assert.match(css, /html\.theme-orange body\.app-active \{[\s\S]*?--nav-bg: #212121/);
});

test('Pinterest grid uses quiet flat cards without folder-colour framing', () => {
  assert.match(css, /Simple Pinterest grid/);
  assert.match(css, /\.view-grid\.mode-detailed \.link-item\.pinned:hover[\s\S]*border-top: 1px solid var\(--border-subtle\)/);
  assert.match(css, /\.view-grid\.mode-detailed \.link-item:hover \{ border-color: var\(--border-strong\); \}/);
  assert.match(css, /\.view-grid\.mode-detailed \.item-meta \.tag:not\(\.tag-project\)/);
  assert.match(css, /\.view-grid\.mode-detailed \.item-hover-actions \.meta-btn \{ backdrop-filter: none/);
});

test('application removes glow while retaining visible focus and drag outlines', () => {
  assert.match(css, /No glow anywhere in the signed-in\/local application/);
  assert.match(css, /body\.app-active :where\(\*, \*::before, \*::after\)[\s\S]*box-shadow: none !important;[\s\S]*text-shadow: none !important/);
  assert.match(css, /body\.app-active :where\(\.brand-mark svg, \.pin-flag\) \{ filter: none !important; \}/);
  assert.match(css, /\.nav-item\.drag-over[\s\S]*outline: 2px solid var\(--brand-primary\)/);
});

test('mobile controls and overlays inherit the active theme palette', () => {
  assert.match(css, /Mobile theme contract/);
  assert.match(css, /body\.app-active \.mobile-tabbar[\s\S]*background: var\(--bg-card\)/);
  assert.match(css, /body\.app-active :where\(\.modal, \.header-menu-dropdown, \.smart-search-actions\)/);
  assert.match(css, /body\.app-active :where\(\.modal input, \.modal textarea, \.modal select\)/);
  assert.match(css, /body\.app-active \.library-ask-error/);
  assert.match(css, /Complete theme-aware text contract/);
  assert.match(css, /body\.app-active #appShell aside :where\(\.brand-name, \.profile-name\)/);
  assert.match(css, /body\.app-active #appShell header \.search-input::placeholder/);
});

test('folder names stay visible when a sidebar row is hovered or keyboard-focused', () => {
  assert.match(css, /aside \.nav-item:hover \.nav-label[\s\S]*color: var\(--nav-active-text\)/);
  assert.match(css, /aside \.nav-item:focus-within \.nav-label/);
});

test('final phone density contract stays compact around unified Finder rows', () => {
  assert.match(css, /Mobile application density contract/);
  assert.match(css, /body\.app-active #appShell header \{[\s\S]*?height: calc\(50px \+ env\(safe-area-inset-top\)\)/);
  assert.match(css, /body\.app-active #appShell \.content-scroll \{[\s\S]*?calc\(64px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /body\.app-active \.mobile-tabbar \{[\s\S]*?calc\(58px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /nav-item\.has-folder-accent\.active \{[\s\S]*?border-left-color: transparent/);
  assert.match(css, /\.finder-row\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /body\.app-active \.library-ask-modal \{ max-height: min\(78dvh, 560px\)/);
  assert.match(css, /body\.app-active \.settings-tab\.active::after/);
  assert.match(css, /body\.app-active \.settings-modal \.settings-tab:focus-visible[\s\S]*?text-decoration: underline/);
});

test('mobile layouts never require horizontal scrolling', () => {
  assert.match(css, /Mobile width contract/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?body\.app-active #appShell,[\s\S]*?body\.landing-active #landingPage \{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;/);
  assert.match(finalSettingsCss, /@media \(max-width: 700px\)[\s\S]*?\.settings-tabs \{[\s\S]*?display: flex;[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto/);
  assert.match(css, /(?:@container[^\{]*\(max-width:\s*700px\)|@media \(max-width: 700px\))[\s\S]*?\.finder-table\s*\{[\s\S]*?overflow-x:\s*(?:clip|hidden|visible)/);
  assert.match(css, /(?:@container[^\{]*\(max-width:\s*700px\)|@media \(max-width: 700px\))[\s\S]*?\.finder-header,[\s\S]*?\.finder-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /body\.app-active #appShell \.sf-actions \{ flex-wrap: wrap; \}/);
  assert.match(css, /\.comparison-table \{ overflow-x: visible; \}/);
  assert.match(landingCss, /Width is protected at the content level[\s\S]*?#landingPage \.sl-theme :is\(\.wrap,[\s\S]*?\.landing-auth-error\) \{\s*min-width:\s*0;\s*max-width:\s*100%;\s*\}/);
  assert.match(landingCss, /#landingPage \.sl-theme :is\(img, picture, svg, video\) \{ max-width: 100%; \}/);
  assert.match(landingCss, /#landingPage \.sl-theme :is\(\.hero \.lede,[\s\S]*?\.landing-auth-error p\) \{\s*overflow-wrap: anywhere;\s*\}/);
  assert.doesNotMatch(landingCss, /(?:body\.landing-active:not\(\.app-active\)|#landingPage|#landingPage \.sl-theme)\s*\{[^}]*overflow(?:-x)?:\s*(?:clip|hidden)/);
  assert.match(landingCss, /@media \(max-width: 720px\)[\s\S]*?\.sl-theme \.win-body \{ grid-template-columns: 1fr; \}/);
});

test('health scan offers a guarded bulk removal for confirmed broken links', () => {
  assert.match(html, /id="healthRemoveBrokenBtn"[^>]*onclick="removeAllBrokenHealth\(\)"/);
  assert.match(app, /result\.issue === 'broken'/);
  assert.match(app, /if \(result\.status === 'broken'\) flagged\.set\(id, 'broken'\)/);
  assert.match(app, /Only links confirmed by the live scan as HTTP 404 or 410/);
  assert.match(app, /result\.status === 'unknown'.*flagged\.set\(id, 'unreachable'\)/);
  assert.match(app, /unreachable: 'Couldn’t verify'/);
  assert.match(html, /id="healthReach" checked/);
  assert.match(app, /removeAllBrokenHealth,/);
  const selectedRemoval = app.slice(app.indexOf('async function removeHealthSelected()'), app.indexOf('async function removeAllBrokenHealth()'));
  const brokenRemoval = app.slice(app.indexOf('async function removeAllBrokenHealth()'), app.indexOf('// Gentler than delete'));
  for (const removal of [selectedRemoval, brokenRemoval]) {
    assert.match(removal, /const confirmed = await uiConfirm\(/);
    assert.match(removal, /if \(!confirmed\) return/);
    assert.ok(removal.indexOf('if (!confirmed) return') < removal.indexOf('items = items.filter'), 'confirmation must precede deletion');
  }
});

test('health scan keeps running after its dialog closes and restores progress when reopened', () => {
  assert.match(html, /id="healthBackgroundNote" hidden>Runs securely on the server — you may close this page and return later/);
  assert.match(html, /id="healthProgress" max="1" value="0" hidden/);
  assert.match(app, /const healthTask = \{[\s\S]*?running: false,[\s\S]*?runId: 0/);
  assert.match(app, /function openHealth\(\) \{[\s\S]*?updateHealthTaskUI\(\)/);
  assert.match(app, /function closeHealth\(\) \{[\s\S]*?Link scan continues securely on the server/);
  assert.match(app, /if \(healthTask\.running\) return/);
  assert.match(app, /fetch\('\/api\/library\/health-job', \{[\s\S]*?method: 'POST'/);
  assert.match(app, /function pollHealthJob\(\)/);
  assert.match(app, /function resumeHealthJob\(silent = false\)/);
  assert.match(app, /applyServerHealthJob\(data\.job, \{ notify: false \}\)/);
  assert.match(app, /catch \(error\) \{[\s\S]*?Link health scan failed[\s\S]*?healthTask\.running = false/);
  assert.match(app, /Link scan finished ·/);
  assert.match(app, /window\.getHealthTaskState = \(\) => \(\{ \.\.\.healthTask, results: healthResults\.length \}\)/);
  assert.match(css, /\.health-progress\[hidden\] \{ display: none; \}/);
});

test('page metadata and keyboard navigation cover the app shell', () => {
  assert.match(html, /<meta name="description"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/saveto\.me\/"/);
  assert.match(html, /<meta property="og:title"/);
  assert.match(html, /class="skip-link" href="#main-content"/);
  assert.match(html, /<main id="main-content" tabindex="-1">/);
  assert.match(html, /class="section-header acc-header" role="button" tabindex="0" aria-expanded="true"/);
  assert.doesNotMatch(css, /@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com/);
});

test('unified Finder body flattens the folder hierarchy without duplicate folder cards', () => {
  assert.match(app, /if \(projectParent\[name\]\) return ICONS\.folder/);
  assert.match(app, /div\.style\.paddingLeft = \(7 \+ depth \* 14\) \+ 'px'/);
  assert.match(app, /Finder source-list methodology: the sidebar contains locations only/);
  assert.match(app, /shownRoots\.forEach\(r => projectContainer\.appendChild\(makeProjectRow\(r, 0, counts, all\)\)\)/);
  assert.match(app, /<nav class="sf-path" aria-label="Folder path">/);
  assert.match(app, /aria-current="location"/);
  assert.match(app, /const matches = roots\.filter/);
  assert.match(app, /favs\.filter\(p => !projectParent\[p\]/);
  assert.match(app, /let finderExpanded = new Set\(\)/);
  for (const functionName of [
    'buildFinderIndex', 'flattenFinderRows', 'renderFinderList',
    'toggleFinderFolder', 'navigateFolder'
  ]) assert.match(app, new RegExp(`function ${functionName}\\b`));
  assert.match(app, /const index = buildFinderIndex\(visibleItems\)/);
  assert.match(app, /row\.expanded = row\.hasChildren && finderExpanded\.has\(row\.id\)/);
  assert.match(app, /if \(row\.expanded\)[\s\S]*?appendContents\(row\.id, depth \+ 1, nextPath\)/);
  assert.match(app, /const flatOnly = !activeFilter \|\| !!\(searchQuery \|\| activeTags\.length \|\| pinnedView \|\| recentView\)/);
  assert.match(app, /All Links is a link collection, never a folder browser/);
  const allLinksHeader = app.match(/function renderAllOverview\(bar\) \{([\s\S]*?)\n    \}/)?.[1] || '';
  assert.doesNotMatch(allLinksHeader, /sf-sub|roots\.length|folderDirectCounts/);
  assert.match(app, /class="finder-table" role="table"/);
  assert.match(app, /class="finder-header" role="row"/);
  assert.match(app, /class="finder-body" role="rowgroup"/);
  assert.match(app, /finder-row finder-folder-row/);
  assert.match(app, /finder-row finder-link-row/);
  assert.match(app, /class="finder-disclosure"[^>]*aria-label="\$\{row\.expanded \? 'Collapse' : 'Expand'\}[^>]*aria-expanded="\$\{row\.expanded\}"/);
  assert.match(app, /class="finder-folder-button"[^>]*onclick="navigateFolder/);
  assert.match(app, /div\.dataset\.depth = String\(row\.depth \+ 1\)/);
  assert.doesNotMatch(app, /sf-folder-band/);
  assert.doesNotMatch(html, /class="acc-caret"/);
  assert.equal((html.match(/class="section-chevron"/g) || []).length, 4);
  assert.doesNotMatch(app, /<span class="sf-label">Folders<\/span>/);
  assert.doesNotMatch(app, /SUBFOLDER_ICON_RULES/);
  assert.doesNotMatch(app, /AUTO_SUBFOLDER_ICONS/);
});

test('Finder table keeps four desktop columns without Kind and one primary no-scroll mobile column', () => {
  const desktopColumns = css.match(/body\.app-active #appShell \.finder-header,\s*body\.app-active #appShell \.finder-row \{([^}]*)\}/)?.[1] || '';
  assert.equal((desktopColumns.match(/minmax\(/g) || []).length, 4);
  assert.match(desktopColumns, /display:\s*grid/);
  assert.match(desktopColumns, /min-width:\s*0/);
  const finderHeader = app.match(/<div class="finder-header" role="row">([\s\S]*?)<div class="finder-body"/)?.[1] || '';
  assert.equal((finderHeader.match(/role="columnheader"/g) || []).length, 4);
  assert.doesNotMatch(finderHeader, />Kind</);
  assert.match(css, /\.finder-name-cell\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.finder-(?:folder-button|link-anchor)\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(css, /@container library-content \(max-width: 700px\)[\s\S]*?\.finder-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) auto/);
  assert.match(css, /(?:@container[^\{]*\(max-width:\s*700px\)|@media \(max-width: 700px\))[\s\S]*?\.finder-(?:context|added|kind|end)[^\{]*\{[\s\S]*?display:\s*none/);
  assert.match(css, /(?:@container[^\{]*\(max-width:\s*700px\)|@media \(max-width: 700px\))[\s\S]*?\.finder-name-meta\s*\{[\s\S]*?display:/);
  assert.match(css, /Final Finder release layer[\s\S]*?\.finder-name-cell\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*16px 22px minmax\(0, 1fr\)/);
  assert.match(css, /#linkList\.finder-active\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent/);
  assert.doesNotMatch(css, /\.finder-table\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /\.sf-folder-band \{ display: none !important; \}/);
});

test('Finder typography stays quiet and reserves emphasis for the active location', () => {
  const quiet = css.slice(css.lastIndexOf('/* Quiet Finder typography'));
  assert.match(quiet, /aside \.nav-item \{\s*font-weight:\s*430/);
  assert.match(quiet, /aside \.nav-item\.active \{\s*font-weight:\s*520/);
  assert.match(quiet, /\.finder-header \{[\s\S]*?font-weight:\s*500/);
  assert.match(quiet, /\.finder-folder-button,\s*body\.app-active #appShell \.finder-link-anchor \{\s*font-weight:\s*440/);
  assert.match(quiet, /\.finder-row:is\(\.active, \.selected, \[aria-selected="true"\]\)[\s\S]*?font-weight:\s*520/);
  assert.match(quiet, /\.mobile-tab \{\s*font-weight:\s*520/);
});

test('folder and subfolder names and icons use a semibold hierarchy', () => {
  const hierarchy = css.slice(css.lastIndexOf('/* Semibold folder hierarchy'));
  assert.match(hierarchy, /\.project-open \.nav-label,[\s\S]*?\.finder-folder-button \{\s*font-weight:\s*600/);
  assert.match(hierarchy, /\.project-open \.nav-icon svg,[\s\S]*?\.finder-folder-icon svg \{\s*stroke-width:\s*2\.35/);
});

test('sidebar group labels stay visually small on desktop and mobile', () => {
  const labels = css.slice(css.lastIndexOf('/* Small sidebar section labels'));
  assert.match(labels, /aside \.section-title \{[\s\S]*?font-size:\s*8px;[\s\S]*?line-height:\s*1\.15/);
  assert.match(labels, /@media \(max-width: 820px\)[\s\S]*?aside \.section-title \{\s*font-size:\s*8px/);
});

test('final mobile colour contract separates chrome, content, selection and destructive actions', () => {
  const colors = css.slice(css.lastIndexOf('/* Mobile colour QA'));
  assert.match(colors, /--orange:\s*#F4511E/);
  assert.match(colors, /--orange-ink:\s*#A9320C/);
  assert.match(colors, /--orange-selected:\s*#FFE3D8/);
  assert.match(colors, /--danger:\s*#B3261E/);
  assert.match(colors, /\.finder-folder-button[\s\S]*?font-weight:\s*650/);
  assert.match(colors, /:is\(\.finder-row\.active, \.finder-row\.selected, \.finder-row\[aria-selected="true"\]\)[\s\S]*?box-shadow:\s*inset 3px 0 0 var\(--orange\)/);
  assert.match(colors, /\.finder-delete:hover,[\s\S]*?color:\s*var\(--danger\)/);
  assert.match(colors, /\.mobile-tab-save \.mobile-save-icon[\s\S]*?background:\s*var\(--orange\)/);
  assert.match(colors, /@media \(max-width: 820px\)[\s\S]*?\.finder-folder-row \{ background: #FFFFFF; \}[\s\S]*?\.finder-link-row \{ background: #FCFCFC; \}/);
});

test('delete and remove controls preserve string ids from cloud sync', () => {
  assert.match(app, /deleteItem\('\$\{jsAttr\(String\(item\.id\)\)\}'\)/);
  assert.match(app, /removeTag\('\$\{jsAttr\(String\(item\.id\)\)\}'/);
  assert.match(app, /const idx = items\.findIndex\(i => sameId\(i\.id, id\)\)/);
  assert.match(app, /items = items\.filter\(i => !sameId\(i\.id, id\)\)/);
  assert.match(app, /dbDelete\(removed\.id\)/);
  assert.match(app, /ids\.forEach\(id => cloudMarkDeleted\(id\)\)/);
  assert.match(css, /\.toast\.show \{[\s\S]*?pointer-events: auto/);
});

test('folder deletion only creates a fallback for links that need re-homing', () => {
  const deletion = app.slice(app.indexOf('async function deleteProject(e, name)'), app.indexOf('// Star =', app.indexOf('async function deleteProject(e, name)')));
  assert.match(deletion, /const moved = items\.filter\(i => i\.project === name \|\| i\.folderId === name\)/);
  assert.match(deletion, /delete projectMeta\[name\]/);
  assert.match(deletion, /if \(moved\.length\) \{[\s\S]*?ensureProject\('General', false, \{ kind: 'system' \}\)/);
  assert.ok(deletion.indexOf('delete folders[name]') < deletion.indexOf("ensureProject('General'"), 'the deleted General folder must not be reused as its own fallback');
});

test('settings import workflow is isolated from the landing animation layer', () => {
  assert.match(html, /<ol class="settings-import-flow" aria-label="Import workflow">/);
  assert.doesNotMatch(html, /<ol class="import-flow" aria-label="Import workflow">/);
  const workflowRule = css.match(/\.settings-import-flow\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(workflowRule, /display:\s*grid/);
  assert.doesNotMatch(workflowRule, /position:\s*absolute/);
  assert.match(css, /\.settings-import-flow li\s*\{[\s\S]*?counter-increment:\s*import-step/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.settings-import-flow \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});

test('desktop sidebar brand and workspace toolbar share one aligned header row', () => {
  const aligned = css.slice(css.lastIndexOf('/* One aligned desktop chrome row'));
  assert.match(aligned, /@media \(min-width: 821px\)/);
  assert.match(aligned, /aside \{[\s\S]*?padding:\s*0 14px 14px/);
  assert.match(aligned, /aside \.brand,[\s\S]*?#appShell header \{[\s\S]*?min-height:\s*58px;[\s\S]*?height:\s*58px/);
  assert.match(aligned, /aside \.brand \{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*0 6px/);
});

test('orange sidebar keeps text readable across idle hover focus and active states', () => {
  const states = css.slice(css.lastIndexOf('/* Sidebar colour hierarchy'));
  const activeBlock = states.match(/html\.theme-orange body\.app-active #appShell aside \.nav-item\.active,[\s\S]*?\{([^}]*)\}/)?.[1] || '';
  assert.match(states, /--sidebar-row-hover:\s*#2A2A2A/);
  assert.match(states, /--sidebar-row-active:\s*#343434/);
  assert.match(states, /--sidebar-text:\s*#F5F5F5/);
  assert.match(activeBlock, /border:\s*0\s*!important/);
  assert.match(activeBlock, /background:\s*var\(--sidebar-row-active\)\s*!important/);
  assert.match(activeBlock, /box-shadow:\s*none\s*!important/);
  assert.doesNotMatch(activeBlock, /inset 3px|border-left|border-inline-start/);
  assert.doesNotMatch(states, /\.nav-item\.active[\s\S]{0,260}?background:\s*#F4511E/);
  assert.match(states, /\.nav-item:focus-within \{[\s\S]*?outline:\s*0/);
  assert.match(states, /\.nav-item:focus-visible,[\s\S]*?\.nav-item:has\(> \.project-open:focus-visible\)[\s\S]*?outline:\s*2px solid #FF8A65/);
  assert.match(states, /\.project-open:focus-visible \{[\s\S]*?outline:\s*0/);
  assert.match(states, /\.nav-right \{[\s\S]*?background:\s*transparent/);
  assert.match(states, /\.proj-act \{[\s\S]*?background:\s*transparent;[\s\S]*?color:\s*var\(--sidebar-icon\)/);
  assert.match(states, /\.proj-act\.on,[\s\S]*?color:\s*var\(--sidebar-favorite\)/);
});

test('sidebar source-list state exposes one current view to assistive technology', () => {
  assert.match(app, /const setCurrentSidebarView = \(element, current\) => \{/);
  assert.match(app, /if \(current\) element\.setAttribute\('aria-current', 'page'\)/);
  assert.match(app, /else element\.removeAttribute\('aria-current'\)/);
  assert.match(app, /setCurrentSidebarView\(na, !activeFilter && !activeTags\.length && !pinnedView && !recentView\)/);
  assert.match(app, /setCurrentSidebarView\(np, pinnedView\)/);
  assert.match(app, /setCurrentSidebarView\(nr, recentView\)/);
  const countGuard = css.slice(css.lastIndexOf('/* Library source rows have no hover actions'));
  assert.match(countGuard, /\[data-acc="library"\][\s\S]*?\.nav-item\.active \.badge[\s\S]*?visibility:\s*visible\s*!important/);
});

test('sidebar folder actions remain part of one continuous row', () => {
  const guard = css.slice(css.lastIndexOf('/* Unified sidebar row actions'));
  assert.match(guard, /\.nav-item \.nav-right,[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?box-shadow:\s*none\s*!important/);
  assert.match(guard, /\.nav-item \.proj-act,[\s\S]*?background:\s*transparent\s*!important;[\s\S]*?color:\s*var\(--sidebar-icon\)\s*!important/);
  assert.match(guard, /\.proj-act\.on,[\s\S]*?color:\s*var\(--sidebar-icon\)\s*!important/);
  assert.doesNotMatch(guard, /--sidebar-action-surface/);
});

test('sidebar brand shows the complete saveto.me identity without a privacy badge', () => {
  const brand = html.match(/<div class="brand">[\s\S]*?<\/button>\s*<\/div>/)?.[0] || '';
  const signature = css.slice(css.lastIndexOf('/* Saveto brand signature'));
  assert.match(brand, /class="brand-identity" aria-label="saveto\.me"/);
  assert.match(brand, /src="\/logo-mark\.png\?v=20260813-13"/);
  assert.match(brand, /class="brand-name"><span>saveto<\/span><span class="brand-domain">\.me<\/span>/);
  assert.doesNotMatch(brand, /brand-sub|private/i);
  assert.match(signature, /aside \.brand-name \{[\s\S]*?overflow:\s*visible;[\s\S]*?text-overflow:\s*clip;[\s\S]*?white-space:\s*nowrap/);
  assert.match(signature, /aside \.brand-domain \{[\s\S]*?color:\s*#FF7043/);
  assert.match(signature, /@media \(max-width: 820px\)[\s\S]*?aside \.brand-name \{[\s\S]*?font-size:\s*17px/);
});

test('header settings icon opens all settings directly instead of an intermediate menu', () => {
  const button = html.match(/<button class="settings-btn" id="btnMenu"[\s\S]*?<\/button>/)?.[0] || '';
  assert.match(button, /onclick="openSettings\(\)"/);
  assert.match(button, /title="All settings"/);
  assert.match(button, /aria-haspopup="dialog"/);
  assert.match(button, /aria-controls="settingsOverlay"/);
  assert.match(button, /<circle cx="12" cy="12" r="3"\/>/);
  assert.doesNotMatch(button, /<circle cx="12" cy="5" r="2"\/>/);
});

test('desktop smart search stays beside Back and Forward navigation', () => {
  const finalCss = css.slice(css.lastIndexOf('/* One aligned desktop chrome row'));
  assert.doesNotMatch(finalCss, /header \.search-bar \{[\s\S]*?position:\s*absolute/);
  assert.doesNotMatch(finalCss, /header \.search-bar \{[\s\S]*?left:\s*50%/);
  assert.match(css, /header \.search-bar \{ width: min\(48vw, 580px\); max-width: 580px; \}/);
});
