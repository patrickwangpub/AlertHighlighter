/* Reads the alert list out of this extension's own lists/ folder and hands it
 * to the content script on request.
 *
 * Nothing is stored and nothing is cached: the file is the only source of
 * truth, so replacing it and reloading the page is enough to pick it up.
 */
importScripts('config.js');

function parseIds(text) {
  return text
    .replace(/^#.*$/gm, '')          // # comment lines
    .split(/[\s,;]+/)
    .map((s) => s.trim().replace(/^["']+|["']+$/g, ''))
    .filter(Boolean);
}

async function loadIds() {
  let ids = [];
  try {
    const r = await fetch(chrome.runtime.getURL(AG_CONFIG.listFile));
    if (r.ok) ids = parseIds(await r.text());
  } catch (e) {
    ids = [];                        // file missing: report an empty list
  }
  return { ids: Array.from(new Set(ids)) };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'getIds') {
    loadIds().then(reply);
    return true;                     // reply comes later
  }
});
