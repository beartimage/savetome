const api = (typeof browser !== 'undefined') ? browser : chrome;
const LIBRARY_ORIGIN = 'https://saveto.me';
const MENU_ID = 'save-to-saveto-me';
const SELECTION_MENU_ID = 'save-selection-to-saveto-me';

function captureUrl(url, title, selection = '') {
  const target = new URL('/', LIBRARY_ORIGIN);
  const capture = new URLSearchParams({ add: url, source: 'extension', close: '1' });
  if (title) capture.set('title', title);
  if (selection) capture.set('selection', selection.slice(0, 5000));
  // Fragments are not sent in HTTP requests, keeping captured page data out of
  // server request URLs while the app opens the first-party capture window.
  target.hash = capture.toString();
  return target.href;
}

async function openCapture(url, title, selection = '') {
  if (!/^https?:\/\//i.test(String(url || ''))) return;
  await api.windows.create({
    url: captureUrl(url, title, selection),
    type: 'popup',
    width: 500,
    height: 720,
    focused: true
  });
}

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({
      id: MENU_ID,
      title: 'Save to saveto.me',
      contexts: ['page', 'link'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
    api.contextMenus.create({
      id: SELECTION_MENU_ID,
      title: 'Save selected text to saveto.me',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*']
    });
  });
});

api.contextMenus.onClicked.addListener((info, tab) => {
  if (![MENU_ID, SELECTION_MENU_ID].includes(info.menuItemId)) return;
  openCapture(
    info.linkUrl || info.pageUrl || (tab && tab.url),
    info.linkUrl ? '' : (tab && tab.title),
    info.menuItemId === SELECTION_MENU_ID ? info.selectionText || '' : ''
  );
});

api.commands.onCommand.addListener(async command => {
  if (command !== 'save-current-page') return;
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab) openCapture(tab.url, tab.title);
});
