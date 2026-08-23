/* Reads the alert lists out of this extension's own lists/ folder and hands
 * them to the content script on request. Nothing is stored: the files are the
 * only source of truth, so Refresh always reflects what is on disk. */
importScripts('config.js');

let cached = null;

function parseIds(text) {
  return text
    .replace(/^#.*$/gm, '')          // # comment lines
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^["']+|["']+$/g, ''))
    .filter(Boolean);
}

async function readFile(path) {
  try {
    const r = await fetch(chrome.runtime.getURL(path));
    return r.ok ? await r.text() : null;
  } catch (e) {
    return null;                     // missing update slot: expected
  }
}

async function loadIds() {
  if (cached) return cached;
  const paths = [AG_CONFIG.baseList];
  for (let i = 1; i <= AG_CONFIG.maxUpdates; i++) {
    paths.push(AG_CONFIG.updatePrefix + i + AG_CONFIG.updateSuffix);
  }
  const texts = await Promise.all(paths.map(readFile));

  const ids = [];
  let files = 0;
  texts.forEach((t) => {
    if (t === null) return;
    files++;
    ids.push.apply(ids, parseIds(t));
  });
  cached = { ids: Array.from(new Set(ids)), files: files };
  return cached;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'getIds') {
    loadIds().then(reply);
    return true;                     // reply comes later
  }
  if (msg.type === 'refresh') {
    cached = null;
    loadIds().then((data) => {
      // Push the new list to every page already open.
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs) {
          chrome.tabs.sendMessage(t.id, { type: 'reload' }, () => {
            void chrome.runtime.lastError;   // tabs without our content script
          });
        }
      });
      reply(data);
    });
    return true;
  }
});
