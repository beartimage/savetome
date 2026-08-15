const api = (typeof browser !== 'undefined') ? browser : chrome;
const LIBRARY_ORIGIN = 'https://saveto.me';
let currentTab = null;

function captureUrl(tab) {
  const target = new URL('/', LIBRARY_ORIGIN);
  target.hash = new URLSearchParams({
    add: tab.url,
    title: tab.title || '',
    source: 'extension',
    close: '1'
  }).toString();
  return target.href;
}

async function init() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  currentTab = tab || null;
  const title = document.getElementById('pageTitle');
  const url = document.getElementById('pageUrl');
  const button = document.getElementById('saveButton');
  if (!tab || !/^https?:\/\//i.test(String(tab.url || ''))) {
    title.textContent = 'This page cannot be saved';
    url.textContent = 'Open a normal website and try again.';
    return;
  }
  title.textContent = tab.title || tab.url;
  url.textContent = tab.url;
  try { document.getElementById('siteLetter').textContent = new URL(tab.url).hostname.replace(/^www\./, '').charAt(0).toUpperCase() || 'S'; }
  catch (_) {}
  button.disabled = false;
}

document.getElementById('saveButton').addEventListener('click', async () => {
  if (!currentTab) return;
  document.getElementById('status').textContent = 'Opening your secure save window…';
  await api.windows.create({ url: captureUrl(currentTab), type: 'popup', width: 500, height: 720, focused: true });
  window.close();
});

document.getElementById('openButton').addEventListener('click', async () => {
  await api.tabs.create({ url: LIBRARY_ORIGIN });
  window.close();
});

init().catch(() => {
  document.getElementById('pageTitle').textContent = 'Could not read this tab';
  document.getElementById('status').textContent = 'Try reopening the extension on a website.';
});
