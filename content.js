(() => {
  'use strict';
  if (window.__alertgreenLoaded) return;
  window.__alertgreenLoaded = true;

  const HIT = 'alertgreen-hit';
  const rule = AG_CONFIG.rule;
  let idSet = new Set();
  let stats = { rows: 0, hits: 0 };
  let queued = false;

  const norm = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, '');
    if (!s) return null;
    return AG_CONFIG.caseSensitive ? s : s.toUpperCase();
  };

  function scan() {
    stats = { rows: 0, hits: 0 };
    let els;
    try { els = document.querySelectorAll(rule.matchSelector); } catch (e) { return; }

    for (const el of els) {
      stats.rows++;
      const id = norm(rule.mode === 'attr' ? el.getAttribute(rule.attr) : el.textContent);

      let target = el;
      for (let i = 0; i < (rule.highlightUp || 0) && target.parentElement; i++) {
        target = target.parentElement;
      }

      if (id && idSet.has(id)) {
        stats.hits++;
        target.classList.add(HIT);
      } else {
        target.classList.remove(HIT);
      }
    }
  }

  function queueScan() {
    if (queued) return;
    queued = true;
    // rAF alone never fires in a background tab, so a timer backs it up.
    const run = () => { if (queued) { queued = false; scan(); } };
    requestAnimationFrame(run);
    setTimeout(run, 250);
  }

  function load() {
    chrome.runtime.sendMessage({ type: 'getIds' }, (data) => {
      void chrome.runtime.lastError;
      idSet = new Set((data && data.ids ? data.ids : []).map(norm).filter(Boolean));
      scan();
    });
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === 'stats') reply({ rows: stats.rows, hits: stats.hits, listSize: idSet.size });
    else if (msg.type === 'reload') { load(); reply({ ok: true }); }
    return true;
  });

  // Grids redraw as the user filters, sorts and scrolls, so re-scan on change.
  new MutationObserver(queueScan).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true
  });

  load();
})();
