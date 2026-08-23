'use strict';

const $ = (id) => document.getElementById(id);
const supportsPicker = typeof window.showDirectoryPicker === 'function';

function say(html, cls) {
  $('status').innerHTML = html;
  $('status').className = cls || 'muted';
}

function renderFiles(files) {
  const t = $('files');
  if (!files || !files.length) { t.style.display = 'none'; return; }
  t.querySelector('tbody').innerHTML = files.map((f) =>
    '<tr><td>' + String(f.name).replace(/[<>&]/g, '') + '</td>' +
    '<td class="num">' + fmt(f.count) + '</td></tr>').join('');
  t.style.display = '';
}

function refreshView() {
  chrome.storage.local.get(
    ['alertIdCount', 'listFiles', 'listSyncedAt', 'listVia', 'cfg'], (d) => {
      $('total').textContent = fmt(d.alertIdCount || 0);
      $('syncline').textContent = d.listSyncedAt
        ? 'Last refreshed ' + new Date(d.listSyncedAt).toLocaleString()
        : 'Never refreshed';
      $('route').innerHTML = d.listVia === 'file'
        ? '<span class="ok">Reading the folder directly - no per-user setup needed.</span>'
        : d.listVia === 'handle'
          ? 'Reading a folder this Chrome was pointed at.'
          : d.listVia === 'manual' ? 'Loaded by hand.' : '';
      renderFiles(d.listFiles);

      const cfg = d.cfg;
      $('cfgInfo').innerHTML = (cfg && cfg.matchSelector)
        ? 'Rule: <code>' + (cfg.mode === 'attr'
            ? cfg.matchSelector + ' &rarr; attribute ' + cfg.attr
            : cfg.matchSelector + ' &rarr; whole cell text') + '</code><br>' +
          'A row turns green only when its value <b>equals</b> a list entry outright. ' +
          'Whitespace is ignored and matching is ' +
          (cfg.caseSensitive ? 'case-sensitive' : 'case-insensitive') + '. ' +
          'There is no substring matching, so <code>A1234</code> can never ' +
          'highlight <code>A12345</code>.'
        : '<span class="warn">No highlight rule set. Open the workflow page and ' +
          'press Alt+Shift+G to configure one.</span>';
    });
}

function afterRefresh(r) {
  if (r.ok) {
    say('Loaded <b>' + fmt(r.count) + '</b> unique IDs from ' + r.files.length +
        ' file(s).', 'ok');
  } else if (r.reason === 'needs-folder') {
    say('Chrome has not been given access to the folder yet. Click ' +
        '<b>Point Chrome at this folder</b> and select ' +
        '<code>' + String(AG_CONFIG.listFolder).replace(/[<>&]/g, '') + '</code>.', 'warn');
  } else if (r.reason === 'needs-permission') {
    say('Chrome needs you to re-confirm access. Click ' +
        '<b>Point Chrome at this folder</b> again.', 'warn');
  } else {
    say('Could not read the folder: ' + String(r.detail || '').replace(/[<>&]/g, ''), 'warn');
  }
  refreshView();
}

/* ------------------------------------------------------------------ wiring */

$('refresh').addEventListener('click', async () => {
  say('Refreshing…');
  afterRefresh(await refreshLists(true));
});

$('pickFolder').addEventListener('click', async () => {
  if (!supportsPicker) { $('folderInput').click(); return; }
  try {
    const h = await window.showDirectoryPicker({ id: 'alertgreen-lists', mode: 'read' });
    await saveHandle(h);
    const r = await readViaHandle(h, true);
    commitLists(r, (n) => {
      say('Connected to <b>' + String(h.name).replace(/[<>&]/g, '') + '</b> - ' +
          fmt(n) + ' IDs from ' + r.perFile.length + ' file(s).', 'ok');
      $('forget').disabled = false;
      refreshView();
    });
  } catch (e) {
    if (e && e.name === 'AbortError') return;              // cancelled
    say('Could not use that folder: ' + String(e && e.message).replace(/[<>&]/g, '') +
        '. Falling back to a plain folder picker.', 'warn');
    $('folderInput').click();
  }
});

$('forget').addEventListener('click', async () => {
  await dropHandle();
  $('forget').disabled = true;
  say('Folder forgotten. Loaded IDs stay until you clear them.');
});

// Plain folder picker, for a Chrome where the handle API is blocked.
$('folderInput').addEventListener('change', async (e) => {
  const files = [...e.target.files].filter((f) => ID_FILE_RE.test(f.name));
  if (!files.length) { say('No .txt / .csv / .tsv files in that folder.', 'warn'); return; }
  const perFile = [], all = [];
  for (const f of files) {
    const ids = parseIds(await f.text());
    perFile.push({ name: f.name, count: ids.length });
    all.push(...ids);
  }
  perFile.sort((a, b) => a.name.localeCompare(b.name));
  commitLists({ perFile, all, via: 'manual' }, (n) => {
    say('Loaded <b>' + fmt(n) + '</b> unique IDs from ' + perFile.length +
        ' file(s). This Chrome cannot remember the folder, so repeat after ' +
        'the files change.', 'ok');
    refreshView();
  });
});

$('fileInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const perFile = [], all = [];
  for (const f of files) {
    const ids = parseIds(await f.text());
    perFile.push({ name: f.name, count: ids.length });
    all.push(...ids);
  }
  commitLists({ perFile, all, via: 'manual' }, (n) => {
    say('Loaded <b>' + fmt(n) + '</b> unique IDs.', 'ok');
    refreshView();
  });
});

$('addPaste').addEventListener('click', () => {
  const list = parseIds($('paste').value);
  if (!list.length) return;
  chrome.storage.local.get(['alertIds'], (d) => {
    const existing = d.alertIds ? d.alertIds.split('\n') : [];
    storeIds(existing.concat(list), { listVia: 'manual' }, (n) => {
      $('paste').value = '';
      say('List now holds <b>' + fmt(n) + '</b> unique IDs.', 'ok');
      refreshView();
    });
  });
});

$('clear').addEventListener('click', () => {
  chrome.storage.local.set(
    { alertIds: '', alertIdCount: 0, listFiles: [], listVia: '' }, () => {
      say('List cleared.');
      refreshView();
    });
});

/* -------------------------------------------------------------- first load */

(async () => {
  $('folderPath').textContent = AG_CONFIG.listFolder || '(not set)';
  if (!AG_CONFIG.listFolder) {
    $('routeHelp').innerHTML = '<span class="warn">No folder set in config.js. ' +
      'Use the manual options below, or set <code>listFolder</code>.</span>';
  } else {
    $('routeHelp').innerHTML =
      'The extension first tries to read this path directly, which needs ' +
      '<b>Allow access to file URLs</b> switched on for this extension in ' +
      '<code>chrome://extensions</code> &rarr; Details. If that is off, point ' +
      'Chrome at the folder once with the button below and Refresh works from ' +
      'then on.';
  }
  if (await loadHandle()) $('forget').disabled = false;
  if (!supportsPicker) $('pickFolder').textContent = 'Choose folder…';

  refreshView();

  if (AG_CONFIG.autoRefreshHours) {
    say('Checking the folder…');
    afterRefresh(await refreshLists(false));
  }
})();
