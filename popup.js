'use strict';

const $ = (id) => document.getElementById(id);

function activeTab() {
  return new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true },
    (tabs) => res(tabs[0])));
}

function ask(tabId, msg) {
  return new Promise((res) => {
    try {
      chrome.tabs.sendMessage(tabId, msg, (r) => {
        void chrome.runtime.lastError;   // swallow "no receiving end"
        res(r || null);
      });
    } catch (e) { res(null); }
  });
}

function ago(ts) {
  if (!ts) return 'never refreshed';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'refreshed just now';
  if (mins < 60) return 'refreshed ' + mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return 'refreshed ' + hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
  return 'refreshed ' + new Date(ts).toLocaleDateString();
}

async function refresh() {
  const tab = await activeTab();
  const d = await new Promise((res) => chrome.storage.local.get(
    ['alertIdCount', 'cfg', 'enabled', 'listSyncedAt', 'listFiles'], res));

  $('count').textContent = fmt(d.alertIdCount || 0);
  $('synced').textContent = ago(d.listSyncedAt) +
    (d.listFiles && d.listFiles.length ? ' from ' + d.listFiles.length + ' file(s)' : '');

  const enabled = d.enabled !== false;
  $('toggle').textContent = enabled ? 'Highlighting: ON' : 'Highlighting: OFF';

  const cfg = d.cfg;
  $('cfg').innerHTML = (cfg && cfg.matchSelector)
    ? 'Rule: <code>' + (cfg.mode === 'attr'
        ? cfg.matchSelector + ' &rarr; ' + cfg.attr
        : cfg.matchSelector + ' &rarr; cell text') + '</code><br>' +
      'Exact whole-value match, ' +
      (cfg.caseSensitive ? 'case-sensitive' : 'case-insensitive') + ', whitespace ignored.'
    : '<span class="warn">No highlight rule configured.</span>';

  const stats = tab ? await ask(tab.id, { type: 'stats' }) : null;
  if (!stats) {
    $('page').innerHTML = '<div class="muted">Not on ' +
      String(AG_CONFIG.siteLabel).replace(/[<>&]/g, '') + '.</div>';
    return;
  }
  $('page').innerHTML =
    '<div class="row"><span class="n green">' + stats.hits + '</span>' +
    '<span>to bulk close on this page</span></div>' +
    '<div class="row"><span class="n">' + stats.candidates + '</span>' +
    '<span class="muted">alerts visible</span></div>';
}

$('refresh').addEventListener('click', async () => {
  const btn = $('refresh');
  btn.disabled = true;
  btn.textContent = 'Refreshing…';
  $('err').textContent = '';
  const r = await refreshLists(false);
  btn.disabled = false;
  btn.textContent = 'Refresh list';
  if (r.ok) {
    const tab = await activeTab();
    if (tab) await ask(tab.id, { type: 'rescan' });
  } else if (r.reason === 'needs-folder' || r.reason === 'needs-permission') {
    // Both need a dialog, which a popup cannot survive - hand off to the tab.
    chrome.runtime.openOptionsPage();
    window.close();
    return;
  } else {
    $('err').textContent = 'Could not read the list folder. Open Advanced → List settings.';
  }
  refresh();
});

$('advToggle').addEventListener('click', () => {
  const a = $('advanced');
  const open = a.style.display === 'block';
  a.style.display = open ? 'none' : 'block';
  $('advToggle').textContent = open ? 'Advanced…' : 'Hide advanced';
});

$('toggle').addEventListener('click', () => {
  chrome.storage.local.get(['enabled'], (d) => {
    chrome.storage.local.set({ enabled: d.enabled === false }, refresh);
  });
});

$('panel').addEventListener('click', async () => {
  const tab = await activeTab();
  if (tab) await ask(tab.id, { type: 'panel' });
  window.close();
});

$('options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

if (!AG_CONFIG.simpleMode) $('advanced').style.display = 'block';

refresh();

(async () => {
  const hrs = Number(AG_CONFIG.autoRefreshHours || 0);
  if (!hrs || !AG_CONFIG.listFolder) return;
  const d = await new Promise((res) => chrome.storage.local.get(['listSyncedAt'], res));
  if (d.listSyncedAt && Date.now() - d.listSyncedAt < hrs * 3600000) return;
  $('synced').textContent = 'Checking for updates…';
  const r = await refreshLists(false);          // never prompts
  if (r.ok) {
    const tab = await activeTab();
    if (tab) await ask(tab.id, { type: 'rescan' });
  }
  refresh();
})();
