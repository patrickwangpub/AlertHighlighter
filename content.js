/* Colours a row/header green when its alert ID is on the bulk-close list.
 * Exact matching only on the extracted alert ID.
 */
(() => {
  'use strict';
  if (window.__alertgreenLoaded) return;
  window.__alertgreenLoaded = true;

  const HIT = 'alertgreen-hit';
  const rules = AG_CONFIG.rules || [AG_CONFIG.rule];
  let idSet = new Set();
  let queued = false;

  const norm = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, '');
    if (!s) return null;
    return AG_CONFIG.caseSensitive ? s : s.toUpperCase();
  };

  function extractId(el, rule) {
    const raw = rule.mode === 'attr' ? el.getAttribute(rule.attr) : el.textContent;
    if (!raw) return null;

    if (rule.regex) {
      const match = raw.match(rule.regex);
      return match && match[1] ? norm(match[1]) : null;
    }
    return norm(raw);
  }

  function scan() {
    for (const rule of rules) {
      let els;
      try { els = document.querySelectorAll(rule.matchSelector); } catch (e) { continue; }

      for (const el of els) {
        const id = extractId(el, rule);

        let target = el;
        for (let i = 0; i < (rule.highlightUp || 0) && target.parentElement; i++) {
          target = target.parentElement;
        }

        if (id && idSet.has(id)) {
          target.classList.add(HIT);
        } else {
          target.classList.remove(HIT);
        }
      }
    }
  }

  function queueScan() {
    if (queued) return;
    queued = true;
    const run = () => { if (queued) { queued = false; scan(); } };
    requestAnimationFrame(run);
    setTimeout(run, 250);
  }

  // Watches for page DOM updates as the user moves from alert to alert
  new MutationObserver(queueScan).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true
  });

  chrome.runtime.sendMessage({ type: 'getIds' }, (data) => {
    void chrome.runtime.lastError;
    idSet = new Set((data && data.ids ? data.ids : []).map(norm).filter(Boolean));
    scan();
  });
})();