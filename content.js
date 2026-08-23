/* Colours a row green when its alert ID is on the bulk-close list.
 *
 * Matching is an exact whole-value match: the element's attribute (or text)
 * must equal a list entry once whitespace is stripped and case is folded.
 * There is no substring matching, so A1234 can never highlight A12345.
 */
(() => {
  'use strict';
  if (window.__alertgreenLoaded) return;
  window.__alertgreenLoaded = true;

  const HIT = 'alertgreen-hit';
  const rule = AG_CONFIG.rule;
  let idSet = new Set();
  let queued = false;

  const norm = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, '');
    if (!s) return null;
    return AG_CONFIG.caseSensitive ? s : s.toUpperCase();
  };

  function scan() {
    let els;
    try { els = document.querySelectorAll(rule.matchSelector); } catch (e) { return; }

    for (const el of els) {
      const id = norm(rule.mode === 'attr' ? el.getAttribute(rule.attr) : el.textContent);

      let target = el;
      for (let i = 0; i < (rule.highlightUp || 0) && target.parentElement; i++) {
        target = target.parentElement;
      }

      if (id && idSet.has(id)) target.classList.add(HIT);
      else target.classList.remove(HIT);
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

  // Grids redraw as the user filters, sorts and scrolls, so re-scan on change.
  new MutationObserver(queueScan).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true
  });

  // Read once per page load, straight from the file on disk. Replacing the
  // file and hitting F5 is what puts a new list into effect.
  chrome.runtime.sendMessage({ type: 'getIds' }, (data) => {
    void chrome.runtime.lastError;
    idSet = new Set((data && data.ids ? data.ids : []).map(norm).filter(Boolean));
    scan();
  });
})();
