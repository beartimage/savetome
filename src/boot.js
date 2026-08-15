import './styles.css';
import './landing-theme.css';

const clientErrorState = { sent: 0, recent: new Map() };
function cleanClientDiagnostic(value, max = 500) {
  return String(value == null ? '' : value)
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
function reportClientError(scope, error) {
  if (clientErrorState.sent >= 5) return;
  const name = cleanClientDiagnostic(error && error.name || 'Error', 80) || 'Error';
  const message = cleanClientDiagnostic(error && error.message || error, 500);
  const cleanScope = cleanClientDiagnostic(scope, 80);
  if (!cleanScope || !message) return;
  const fingerprint = `${cleanScope}\u0000${name}\u0000${message}`;
  const previous = clientErrorState.recent.get(fingerprint) || 0;
  if (Date.now() - previous < 300_000) return;
  clientErrorState.recent.set(fingerprint, Date.now());
  clientErrorState.sent += 1;
  fetch('/api/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ scope: cleanScope, name, message }),
    credentials: 'same-origin',
    keepalive: true
  }).catch(() => {});
}
window.addEventListener('error', event => reportClientError('window.error', event.error || event.message));
window.addEventListener('unhandledrejection', event => reportClientError('unhandledrejection', event.reason));
window.reportClientError = reportClientError;

const url = new URL(window.location.href);
const authResult = url.searchParams.get('auth');
const hasAuthError = Boolean(authResult && authResult !== 'ok');
const isAppRoute = url.pathname === '/app' || url.searchParams.has('add') || (url.searchParams.has('onboarding') && !hasAuthError);

if (isAppRoute) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#212121');
  document.body.classList.remove('landing-active');
  document.body.classList.add('app-active');
  document.getElementById('landingPage')?.setAttribute('hidden', '');
  document.title = 'My Library — saveto.me';
  document.querySelector('meta[name="description"]')?.setAttribute('content', 'Open your private saveto.me Personal Internet Library.');
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex,nofollow');
  import('./app.js').then(() => {
    document.documentElement.classList.remove('app-booting');
    if (window.location.hash === '#import') {
      window.setTimeout(() => window.openSettings?.('data'), 120);
    }
  }).catch(error => {
    document.documentElement.classList.remove('app-booting');
    console.error('Application failed to start', error);
    reportClientError('app.start', error);
    document.body.dataset.appStartError = 'true';
    showAppStartError();
  });
} else {
  // Landing / failed-auth route: the head snippet may have painted the
  // full-screen boot overlay (it adds `app-booting` on any ?onboarding),
  // so it MUST be torn down here or the UI stays covered forever.
  document.documentElement.classList.remove('app-booting');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#212121');
  document.body.classList.add('landing-active');
  initLandingReveal();
  initLandingNavigation();
  initLandingAuth();
  if (hasAuthError) showLandingAuthError(authResult);
}

function showLandingAuthError(reason) {
  const landing = document.querySelector('#landingPage .sl-theme');
  const nav = landing?.querySelector('.nav-shell');
  if (!landing || !nav) return;

  const message = reason === 'unconfigured'
    ? 'Вход временно недоступен. Попробуйте немного позже.'
    : 'Не удалось выполнить вход. Никакие данные не были изменены — попробуйте ещё раз.';
  const alert = document.createElement('div');
  alert.className = 'landing-auth-error';
  alert.setAttribute('role', 'alert');
  alert.innerHTML = `<p>${message}</p><button class="landing-auth-error-retry" type="button">Попробовать снова</button>`;
  nav.insertAdjacentElement('afterend', alert);
  alert.querySelector('button')?.addEventListener('click', () => {
    landing.querySelector('.nav .btn-primary')?.click();
  });

  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete('auth');
  cleanUrl.searchParams.delete('e');
  window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
}

function showAppStartError() {
  const shell = document.getElementById('appShell');
  if (!shell || shell.querySelector('.app-start-error')) return;
  const panel = document.createElement('main');
  panel.className = 'app-start-error';
  panel.setAttribute('role', 'alert');
  panel.setAttribute('aria-live', 'assertive');
  panel.innerHTML = `
    <img src="/logo-mark.svg?v=20260813-13" width="48" height="48" alt="">
    <h1>Не удалось открыть библиотеку</h1>
    <p>Попробуйте загрузить страницу ещё раз. Ваши локальные данные не будут удалены.</p>
    <div class="app-start-error-actions">
      <button type="button" data-app-retry>Повторить</button>
      <a href="/">На главную</a>
    </div>`;
  shell.replaceChildren(panel);
  panel.querySelector('[data-app-retry]')?.addEventListener('click', () => window.location.reload());
}

function initLandingNavigation() {
  const header = document.querySelector('.sl-theme .nav-shell');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 16);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function initLandingReveal() {
  const landing = document.querySelector('.sl-theme');
  if (!landing) return;
  const elements = [...landing.querySelectorAll('.reveal')];
  if (!('IntersectionObserver' in window)) {
    elements.forEach(element => element.classList.add('in'));
    return;
  }
  landing.classList.add('landing-reveal-ready');
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  elements.forEach(element => observer.observe(element));
}

function initLandingAuth() {
  const overlay = document.getElementById('landingAuthOverlay');
  const card = overlay?.querySelector('.landing-auth-card');
  const close = overlay?.querySelector('.landing-auth-close');
  if (!overlay || !card || !close) return;
  const background = [...document.querySelectorAll('.landing-page > :not(#landingAuthOverlay)')];
  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let authStatus = 'loading';
  let returnFocus = null;
  const authReady = fetch('/api/me', { headers: { Accept: 'application/json' } })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      authStatus = data?.user ? 'signed-in' : 'signed-out';
      return authStatus === 'signed-in';
    })
    .catch(() => {
      authStatus = 'signed-out';
      return false;
    });

  const setBackgroundInert = inert => {
    background.forEach(element => {
      element.inert = inert;
      if (inert) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    });
  };

  const show = trigger => {
    returnFocus = trigger || document.activeElement;
    overlay.inert = false;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    setBackgroundInert(true);
    document.body.classList.add('landing-modal-open');
    window.setTimeout(() => close.focus(), 40);
  };
  const hide = () => {
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    setBackgroundInert(false);
    document.body.classList.remove('landing-modal-open');
    const target = returnFocus;
    returnFocus = null;
    window.requestAnimationFrame(() => {
      if (target?.isConnected && typeof target.focus === 'function') target.focus();
    });
  };

  document.querySelectorAll('.landing-page a[href^="/app"]').forEach(link => {
    link.addEventListener('click', async event => {
      if (authStatus === 'signed-in') return;
      event.preventDefault();
      if (authStatus === 'loading') {
        link.setAttribute('aria-busy', 'true');
        const signedIn = await authReady;
        link.removeAttribute('aria-busy');
        if (signedIn) {
          window.location.assign(link.href);
          return;
        }
      }
      show(link);
    });
  });
  close.addEventListener('click', hide);
  overlay.addEventListener('click', event => { if (event.target === overlay) hide(); });
  document.addEventListener('keydown', event => {
    if (!overlay.classList.contains('show')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      hide();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...card.querySelectorAll(focusableSelector)].filter(element => !element.hidden && element.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      close.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
