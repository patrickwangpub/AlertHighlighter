'use strict';

function parseIds(text) {
  return String(text)
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^["']+|["']+$/g, '').trim())
    .filter(Boolean);
}

const ID_FILE_RE = /\.(txt|csv|tsv)$/i;

function storeIds(list, extra, cb) {
  const set = new Set(list);
  const payload = Object.assign(
    { alertIds: Array.from(set).join('\n'), alertIdCount: set.size },
    extra || {}
  );
  chrome.storage.local.set(payload, () => cb(set.size));
}

function fmt(n) { return Number(n).toLocaleString(); }
