// On-device link classifier — no backend, no API calls.
// A curated domain knowledge base + weighted token matching over the URL (and
// any known title/note) produces normalized, de-duplicated, ranked tags plus a
// human description entirely in the browser. Also owns the learned per-domain
// tag overrides (persisted to localStorage).

import { titleCase } from './util.js';

// --- Learned tag overrides (persisted) — feature #11 ------------------------
const OVERRIDE_KEY = 'saveme_tag_overrides';
let tagOverrides = {};
try { tagOverrides = JSON.parse(localStorage.getItem(OVERRIDE_KEY)) || {}; } catch (_) {}
function saveOverrides() { try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(tagOverrides)); } catch (_) {} }
export function recordTagOverride(domain, tag, action) {
  if (!domain) return;
  const d = domain.toLowerCase();
  const o = tagOverrides[d] || (tagOverrides[d] = { add: [], remove: [] });
  const norm = normalizeTag(tag);
  o.add = o.add.filter(t => t !== norm);
  o.remove = o.remove.filter(t => t !== norm);
  if (action === 'add') o.add.push(norm);
  else if (action === 'remove') o.remove.push(norm);
  saveOverrides();
}

// Known domains → { tags, description, category }. Matched by substring on host.
// Match a KNOWN_DOMAINS pattern against a hostname on DOMAIN-LABEL boundaries,
// never a raw substring — so 'x.com' (Twitter) matches x.com / *.x.com but NOT
// 'stockx.com' or 'netflix.com'. Three pattern shapes:
//   'amazon.'            → prefix: a whole label equals 'amazon' (amazon.co.uk, amazon.com)
//   'github.com'         → dotted domain: exact host or a subdomain (gist.github.com)
//   'mdn'                → bare word: matches a whole domain label only
export function hostMatchesPattern(host, m) {
  host = String(host || '').toLowerCase().replace(/^www\./, '');
  if (m.endsWith('.')) {
    const base = m.slice(0, -1);
    return host === base || host.startsWith(m) || host.split('.').includes(base);
  }
  if (m.includes('.')) {
    return host === m || host.endsWith('.' + m) || host.startsWith(m + '.') || host.includes('.' + m + '.');
  }
  return host.split('.').includes(m);
}

const KNOWN_DOMAINS = [
  { m: ['github.com','gitlab.com','bitbucket.org'], tags: ['Dev','Code','Git'], cat: 'dev', desc: 'Code repository or version-controlled project.' },
  { m: ['stackoverflow.com','stackexchange.com'], tags: ['Dev','Q&A'], cat: 'dev', desc: 'Programming question, answer, or discussion.' },
  { m: ['npmjs.com','pypi.org','crates.io','packagist.org'], tags: ['Dev','Package'], cat: 'dev', desc: 'Software package or library.' },
  { m: ['developer.mozilla.org','mdn'], tags: ['Dev','Docs','Web'], cat: 'doc', desc: 'Web platform documentation.' },
  { m: ['readthedocs','docs.'], tags: ['Docs','Reference'], cat: 'doc', desc: 'Technical documentation.' },
  { m: ['dribbble.com','behance.net'], tags: ['Design','Inspiration'], cat: 'design', desc: 'Design inspiration and showcase work.' },
  { m: ['figma.com','sketch.com','framer.com','penpot.app'], tags: ['Design','UI/UX','Tool'], cat: 'design', desc: 'Design or prototyping tool.' },
  { m: ['youtube.com','youtu.be','vimeo.com'], tags: ['Video','Media'], cat: 'video', desc: 'Online video content.' },
  { m: ['twitch.tv'], tags: ['Video','Streaming'], cat: 'video', desc: 'Live streaming channel or clip.' },
  { m: ['spotify.com','soundcloud.com','music.apple.com'], tags: ['Music','Audio'], cat: 'video', desc: 'Music or audio content.' },
  { m: ['medium.com','substack.com','dev.to','hashnode'], tags: ['Article','Blog'], cat: 'doc', desc: 'Article or blog post.' },
  { m: ['news.ycombinator.com'], tags: ['News','Tech','Community'], cat: 'social', desc: 'Hacker News discussion.' },
  { m: ['techcrunch.com','theverge.com','arstechnica.com','wired.com'], tags: ['News','Tech'], cat: 'doc', desc: 'Technology news article.' },
  { m: ['twitter.com','x.com','linkedin.com','facebook.com','instagram.com','reddit.com','mastodon','threads.net'], tags: ['Social'], cat: 'social', desc: 'Social media post or profile.' },
  { m: ['notion.so','coda.io'], tags: ['Docs','Productivity'], cat: 'doc', desc: 'Workspace document or note.' },
  { m: ['docs.google.com','drive.google.com'], tags: ['Docs','Cloud'], cat: 'doc', desc: 'Google Docs / Drive file.' },
  { m: ['trello.com','asana.com','linear.app','atlassian.net','jira','monday.com','clickup.com'], tags: ['Productivity','PM'], cat: 'doc', desc: 'Project or task management.' },
  { m: ['amazon.','ebay.com','etsy.com','aliexpress','shopify'], tags: ['Shopping'], cat: 'shop', desc: 'Product or online store.' },
  { m: ['stockx.com','goat.com','grailed.com','depop.com','poshmark.com','stubhub.com'], tags: ['Shopping','Marketplace'], cat: 'shop', desc: 'Online marketplace or resale platform.' },
  { m: ['stripe.com','paypal.com','wise.com'], tags: ['Finance','Payments'], cat: 'shop', desc: 'Payments or finance service.' },
  { m: ['supabase.com','firebase.google.com','planetscale.com','mongodb.com','neon.tech'], tags: ['Database','Backend'], cat: 'db', desc: 'Database or backend service.' },
  { m: ['vercel.com','netlify.com','cloudflare.com','aws.amazon.com','console.cloud.google','azure.','heroku.com','render.com'], tags: ['Cloud','Hosting','DevOps'], cat: 'dev', desc: 'Cloud hosting or infrastructure.' },
  { m: ['openai.com','chatgpt.com','anthropic.com','claude.ai','huggingface.co','replicate.com','midjourney','perplexity.ai'], tags: ['AI','ML'], cat: 'ai', desc: 'AI model, tool, or platform.' },
  { m: ['kaggle.com'], tags: ['AI','Data'], cat: 'ai', desc: 'Datasets and machine-learning competitions.' },
  { m: ['coursera.org','udemy.com','edx.org','khanacademy.org','freecodecamp'], tags: ['Learning','Course'], cat: 'doc', desc: 'Online course or learning resource.' },
  { m: ['wikipedia.org'], tags: ['Reference'], cat: 'doc', desc: 'Encyclopedia reference article.' }
];

// Keyword lexicon → tags. Matched as whole-ish tokens in the URL/title.
const KEYWORD_RULES = [
  { words: ['code','git','api','sdk','npm','yarn','pnpm','compiler','repo','repository','backend','server','runtime','framework','library','function','deploy','deployment','docker','kubernetes','k8s','terminal','cli','regex','webpack','vite'], tags: ['Dev'] },
  { words: ['javascript','typescript','python','rust','golang','java','kotlin','swift','php','ruby','node','deno','react','vue','svelte','angular','nextjs','django','flask','rails'], tags: ['Dev','Code'] },
  { words: ['css','html','tailwind','sass','scss','flexbox','grid','layout','responsive','animation'], tags: ['CSS','Web'] },
  { words: ['docs','documentation','guide','manual','reference','wiki','handbook','spec','specification','changelog','readme'], tags: ['Docs'] },
  { words: ['design','ui','ux','prototype','mockup','wireframe','figma','sketch','typography','palette','color','icon','icons','font','fonts','theme','branding','logo'], tags: ['Design'] },
  { words: ['video','watch','stream','movie','film','episode','trailer','clip','webinar','screencast'], tags: ['Video'] },
  { words: ['music','audio','podcast','track','album','song','playlist','soundtrack'], tags: ['Audio'] },
  { words: ['blog','post','article','story','read','essay','newsletter','opinion','column'], tags: ['Article'] },
  { words: ['ai','ml','gpt','llm','model','models','neural','dataset','embedding','embeddings','transformer','inference','prompt','agent','agents','rag','fine-tuning','finetuning'], tags: ['AI'] },
  { words: ['shop','store','product','buy','cart','deal','deals','price','pricing','checkout','order','sale'], tags: ['Shopping'] },
  { words: ['news','breaking','headline','headlines','press','report','coverage'], tags: ['News'] },
  { words: ['learn','course','courses','tutorial','tutorials','lesson','lessons','how-to','howto','bootcamp','training','workshop','curriculum'], tags: ['Learning'] },
  { words: ['finance','bank','banking','invoice','payment','payments','pay','billing','budget','tax','crypto','bitcoin','ethereum','wallet','trading','stocks','investing'], tags: ['Finance'] },
  { words: ['data','database','sql','nosql','analytics','dashboard','metrics','warehouse','etl','pipeline','query'], tags: ['Data'] },
  { words: ['security','auth','oauth','login','signin','token','vault','encryption','privacy','vulnerability','cve','pentest'], tags: ['Security'] },
  { words: ['job','jobs','career','careers','hiring','recruit','recruiting','resume','cv','interview','salary'], tags: ['Career'] },
  { words: ['game','games','gaming','gamedev','unity','unreal','steam','playstation','xbox','nintendo'], tags: ['Gaming'] },
  { words: ['recipe','recipes','cooking','food','restaurant','meal','baking','kitchen'], tags: ['Food'] },
  { words: ['travel','flight','flights','hotel','hotels','trip','vacation','itinerary','booking','airbnb','destination'], tags: ['Travel'] },
  { words: ['health','fitness','workout','nutrition','diet','wellness','medical','medicine','exercise','yoga'], tags: ['Health'] },
  { words: ['photo','photos','photography','camera','lightroom','preset','presets','image','images','picture','wallpaper'], tags: ['Photography'] },
  { words: ['marketing','seo','ads','advertising','campaign','growth','funnel','conversion','copywriting','email'], tags: ['Marketing'] },
  { words: ['startup','startups','founder','venture','vc','saas','b2b','fundraising','pitch','mvp'], tags: ['Startups'] },
  { words: ['productivity','notes','notetaking','task','tasks','todo','calendar','planner','organize','workflow'], tags: ['Productivity'] },
  { words: ['mobile','ios','android','app','apps','flutter','swiftui','react-native'], tags: ['Mobile'] },
  { words: ['science','research','paper','papers','study','arxiv','journal','physics','biology','chemistry'], tags: ['Research'] }
];

// Multi-word phrases → tags. Matched against the readable title + slug so
// real topics ("machine learning") beat loose single-token matches.
const PHRASE_RULES = [
  { p: ['machine learning','deep learning','neural network','large language model','language model','computer vision','generative ai','artificial intelligence'], tags: ['AI','ML'] },
  { p: ['user interface','user experience','design system','component library','design tokens','human interface'], tags: ['Design','UI/UX'] },
  { p: ['open source'], tags: ['Open Source'] },
  { p: ['getting started','quick start','quickstart','cheat sheet','cheatsheet','step by step'], tags: ['Guide'] },
  { p: ['best practices','style guide','api reference','coding standards'], tags: ['Reference'] },
  { p: ['data science','data analysis','data visualization','big data'], tags: ['Data'] },
  { p: ['web development','front end','front-end','back end','back-end','full stack','full-stack','web app'], tags: ['Dev','Web'] },
  { p: ['product design','landing page','case study','design inspiration'], tags: ['Design'] },
  { p: ['project management','product management','remote work'], tags: ['Productivity'] },
  { p: ['side project','indie hacker','build in public'], tags: ['Startups'] }
];

// Canonical casing for tags so display is consistent (acronyms preserved).
const TAG_CASE = {
  'ai':'AI','ml':'ML','ui':'UI','ux':'UX','ui/ux':'UI/UX','ux/ui':'UX/UI','api':'API','sdk':'SDK',
  'pm':'PM','sql':'SQL','q&a':'Q&A','devops':'DevOps','saas':'SaaS','css':'CSS','html':'HTML',
  'js':'JavaScript','ios':'iOS','cli':'CLI','seo':'SEO','vc':'VC','b2b':'B2B','cv':'CV','mvp':'MVP'
};

export function normalizeTag(tag) {
  const raw = String(tag == null ? '' : tag);
  const key = raw.trim().toLowerCase();
  if (TAG_CASE[key]) return TAG_CASE[key];
  return raw.trim().replace(/\b\w/g, c => c.toUpperCase());
}

// Turn a URL path into a human-readable title, e.g.
// "/questions/tagged/css-grid" → "Css Grid" and a slug page → Title Case.
const STOP_SLUG = new Set(['www','com','org','net','io','html','htm','php','aspx','index','page','en','en-us','docs','blog','www2','amp']);
export function prettifyTitle(path, domain) {
  const segs = String(path || '').split('/').map(s => s.trim()).filter(Boolean);
  // Prefer the last meaningful, word-like segment (the slug).
  let slug = '';
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = decodeURIComponent(segs[i]).replace(/\.(html?|php|aspx?)$/i, '');
    const words = s.split(/[-_+]+/).filter(Boolean);
    if (words.length >= 2 || (words.length === 1 && words[0].length >= 4 && !/^\d+$/.test(words[0]) && !STOP_SLUG.has(words[0].toLowerCase()))) {
      slug = words.join(' ');
      break;
    }
  }
  if (slug) return titleCase(slug).replace(/\b\w+\b/g, w => {
    const k = w.toLowerCase();
    return TAG_CASE[k] && TAG_CASE[k].length <= 5 ? TAG_CASE[k] : w;
  });
  // Fall back to the site name (domain minus TLD).
  const host = String(domain || '').replace(/^www\./, '');
  return titleCase(host.split('.')[0] || host);
}

export function generateLinkMetadata(url, domain, path, title) {
  const host = (domain || '').toLowerCase();
  let search = '';
  try { search = new URL(url).search.toLowerCase(); } catch (_) {}
  const slugText = (path || '').replace(/[-_/+]+/g, ' ');
  const titleText = (title || '').toLowerCase();
  const phraseHay = (slugText + ' ' + titleText).toLowerCase();
  const haystack = (host + ' ' + slugText + ' ' + titleText + ' ' + search).toLowerCase();
  const tokens = haystack.split(/[^a-z0-9]+/).filter(t => t.length > 1);
  const tokenSet = new Set(tokens);

  // scores: tag -> weight. Higher = more confident.
  const scores = {};
  let description = null;
  const add = (tag, w) => { const t = normalizeTag(tag); scores[t] = (scores[t] || 0) + w; };

  // 1) Known-domain match (strongest signal) — label-boundary host match only.
  for (const rule of KNOWN_DOMAINS) {
    if (rule.m.some(m => hostMatchesPattern(host, m))) {
      rule.tags.forEach((t, i) => add(t, 10 - i));
      if (!description) description = rule.desc;
    }
  }

  // 2) Multi-word phrases in the title/slug (strong topical signal).
  for (const rule of PHRASE_RULES) {
    if (rule.p.some(ph => phraseHay.includes(ph))) {
      rule.tags.forEach((t, i) => add(t, 7 - i));
    }
  }

  // 3) Keyword lexicon. Slug/title token hits weigh more than anywhere-in-URL.
  for (const rule of KEYWORD_RULES) {
    let hit = 0;
    for (const w of rule.words) {
      if (tokenSet.has(w)) hit = Math.max(hit, 5);              // exact token in path/title
      else if (w.length >= 5 && haystack.includes(w)) hit = Math.max(hit, 3); // glued substring (long words only)
    }
    if (hit) rule.tags.forEach((t, i) => add(t, Math.max(1, hit - i)));
  }

  // 4) Split by confidence — score >= 6 is confident, the rest are suggestions.
  const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  let autoTags = ranked.filter(t => scores[t] >= 6);
  let suggestedTags = ranked.filter(t => scores[t] < 6);
  if (autoTags.length === 0 && suggestedTags.length) autoTags.push(suggestedTags.shift());
  if (autoTags.length === 0) autoTags = ['Web'];

  // 5) Apply learned per-domain overrides (#11).
  const ov = Object.hasOwn(tagOverrides, host) ? tagOverrides[host] : null;
  if (ov && Array.isArray(ov.remove) && Array.isArray(ov.add)) {
    autoTags = autoTags.filter(t => !ov.remove.includes(t));
    suggestedTags = suggestedTags.filter(t => !ov.remove.includes(t));
    ov.add.forEach(t => { if (!autoTags.includes(t)) autoTags.unshift(t); suggestedTags = suggestedTags.filter(s => s !== t); });
    if (autoTags.length === 0) autoTags = ['Web'];
  }

  autoTags = autoTags.slice(0, 4);
  suggestedTags = suggestedTags.filter(t => !autoTags.includes(t)).slice(0, 4);

  if (!description) {
    const nice = title && !/^https?:/i.test(title) ? title : '';
    const topic = autoTags.filter(t => t !== 'Web').slice(0, 2).join(' / ');
    const site = String(domain || '').replace(/^www\./, '');
    description = nice
      ? `${nice}${topic ? ' — ' + topic : ''} · ${site}`
      : topic
        ? `${topic} resource from ${site}.`
        : `Saved link from ${site}${path && path !== '/' ? ' · ' + path : ''}.`;
  }

  return { autoTags, suggestedTags, description };
}

// Map a tag to a color class. Category keywords first, then a stable
// hash-based fallback so every unknown tag still gets a consistent color.
const TAG_COLOR_FALLBACK = ['tag-design','tag-dev','tag-db','tag-ai','tag-video','tag-doc','tag-social','tag-shop'];
export function getTagColorClass(tag) {
  const l = String(tag == null ? '' : tag).toLowerCase();
  if (/(design|ui|ux|inspiration|saas)/.test(l)) return 'tag-design';
  if (/(dev|code|git|api|sdk|backend|hosting|cloud|devops|package|q&a)/.test(l)) return 'tag-dev';
  if (/(database|postgres|sql|data|analytics)/.test(l)) return 'tag-db';
  if (/(^ai$|ml|gpt|llm|model)/.test(l)) return 'tag-ai';
  if (/(video|media|streaming|music|audio|podcast)/.test(l)) return 'tag-video';
  if (/(doc|article|blog|news|reference|learning|course|productivity|pm)/.test(l)) return 'tag-doc';
  if (/(social|community)/.test(l)) return 'tag-social';
  if (/(shop|shopping|finance|payments|deal)/.test(l)) return 'tag-shop';
  if (l === 'web') return 'tag-default';
  let h = 0; for (let i = 0; i < l.length; i++) h = (h * 31 + l.charCodeAt(i)) >>> 0;
  return TAG_COLOR_FALLBACK[h % TAG_COLOR_FALLBACK.length];
}
