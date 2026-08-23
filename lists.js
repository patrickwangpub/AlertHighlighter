'use strict';

function pathToFileUrl(p) {
  if (!p) return '';
  let s = String(p).trim().replace(/\\/g, '/');
  if (/^file:\/\//i.test(s)) return s.replace(/\/?$/, '/');
  if (/^\/\//.test(s)) return 'file://' + s.replace(/^\/+/, '') .replace(/\/?$/, '/');
  return 'file:///' + s.replace(/^\/+/, '').replace(/\/?$/, '/');
}

/* ------------------------------------------------- route 1: file:// direct */
function xhrText(url) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    try { x.open('GET', url, true); } catch (e) { reject(e); return; }
    x.onload = () => resolve(x.responseText || '');
    x.onerror = () => reject(new Error('blocked'));
    x.ontimeout = () => reject(new Error('timeout'));
    x.timeout = 20000;
    try { x.send(); } catch (e) { reject(e); }
  });
}

function parseDirListing(html) {
  const names = [];
  const addRow = /addRow\("(?:[^"\\]|\\.)*","((?:[^"\\]|\\.)*)"\s*,\s*(\d)/g;
  let m;
  while ((m = addRow.exec(html)) !== null) {
    if (m[2] === '1') continue;                       // a directory
    try { names.push(decodeURIComponent(m[1])); } catch (e) { names.push(m[1]); }
  }
  if (!names.length) {
    const href = /<a[^>]+href="([^"]+)"/gi;
    while ((m = href.exec(html)) !== null) {
      const h = m[1];
      if (h === '../' || h.endsWith('/')) continue;
      try { names.push(decodeURIComponent(h)); } catch (e) { names.push(h); }
    }
  }
  return names.filter((n) => ID_FILE_RE.test(n));
}

async function readViaFileUrl(folderPath) {
  const base = pathToFileUrl(folderPath);
  if (!base) throw new Error('no folder configured');
  const listing = await xhrText(base);
  const names = parseDirListing(listing);
  if (!names.length) throw new Error('no list files found at ' + folderPath);

  const perFile = [];
  const all = [];
  for (const name of names) {
    const text = await xhrText(base + encodeURIComponent(name));
    const ids = parseIds(text);
    perFile.push({ name: name, count: ids.length });
    all.push.apply(all, ids);
  }
  perFile.sort((a, b) => a.name.localeCompare(b.name));
  return { perFile: perFile, all: all, via: 'file' };
}

/* ------------------------------------------ route 2: remembered folder handle */
const HDB = 'alertgreen', HSTORE = 'handles', HKEY = 'folder';

function hdb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(HDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(HSTORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function saveHandle(h) {
  const db = await hdb();
  return new Promise((res, rej) => {
    const tx = db.transaction(HSTORE, 'readwrite');
    tx.objectStore(HSTORE).put(h, HKEY);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}

async function loadHandle() {
  try {
    const db = await hdb();
    return await new Promise((res, rej) => {
      const tx = db.transaction(HSTORE, 'readonly');
      const q = tx.objectStore(HSTORE).get(HKEY);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch (e) { return null; }
}

async function dropHandle() {
  try {
    const db = await hdb();
    await new Promise((res) => {
      const tx = db.transaction(HSTORE, 'readwrite');
      tx.objectStore(HSTORE).delete(HKEY);
      tx.oncomplete = res;
    });
  } catch (e) { /* nothing to drop */ }
}

async function readViaHandle(dirHandle, interactive) {
  const opts = { mode: 'read' };
  let perm = await dirHandle.queryPermission(opts);
  if (perm !== 'granted' && interactive) perm = await dirHandle.requestPermission(opts);
  if (perm !== 'granted') throw new Error('needs-permission');

  const perFile = [];
  const all = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind !== 'file' || !ID_FILE_RE.test(entry.name)) continue;
    const ids = parseIds(await (await entry.getFile()).text());
    perFile.push({ name: entry.name, count: ids.length });
    all.push.apply(all, ids);
  }
  if (!perFile.length) throw new Error('no list files in that folder');
  perFile.sort((a, b) => a.name.localeCompare(b.name));
  return { perFile: perFile, all: all, via: 'handle' };
}

/* ------------------------------------------------------------- committing */
function commitLists(result, cb) {
  storeIds(result.all, {
    listFiles: result.perFile,
    listVia: result.via,
    listSource: AG_CONFIG.listFolder || 'folder',
    listSyncedAt: Date.now()
  }, cb);
}

/* --------------------------------------------------------------- refresh */
async function refreshLists(interactive) {
  if (AG_CONFIG.listFolder) {
    try {
      const r = await readViaFileUrl(AG_CONFIG.listFolder);
      return await new Promise((res) => commitLists(r, (n) =>
        res({ ok: true, count: n, files: r.perFile, via: 'file' })));
    } catch (e) { /* fall through to the remembered handle */ }
  }
  const h = await loadHandle();
  if (h) {
    try {
      const r = await readViaHandle(h, !!interactive);
      return await new Promise((res) => commitLists(r, (n) =>
        res({ ok: true, count: n, files: r.perFile, via: 'handle' })));
    } catch (e) {
      return { ok: false, reason: e.message === 'needs-permission'
        ? 'needs-permission' : 'read-failed', detail: e.message };
    }
  }
  return { ok: false, reason: 'needs-folder' };
}
