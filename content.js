(() => {
  'use strict';
  if (window.__alertgreenLoaded) return;
  window.__alertgreenLoaded = true;

  const HIT = 'alertgreen-hit';
  const PREVIEW = 'alertgreen-preview';
  const HOVER = 'alertgreen-pickhover';

  let idSet = new Set();
  let rawIds = '';
  let cfg = null;
  let enabled = true;
  let stats = { candidates: 0, ids: 0, hits: 0 };
  let observer = null;
  let rescanQueued = false;

  const DEFAULT_CFG = {
    mode: 'attr',          // 'attr' | 'text'
    matchSelector: '',     // CSS selector for the element carrying the id
    attr: '',              // attribute name when mode === 'attr'
    highlightUp: 0,        // how many ancestors up from the match to colour
    caseSensitive: false
  };



  /* ---------------------------------------------------------------- utils */
  const norm = (v) => {
    if (v == null) return null;
    const s = String(v).replace(/\s+/g, '');
    if (!s) return null;
    return (cfg && cfg.caseSensitive) ? s : s.toUpperCase();
  };

  const up = (el, n) => {
    let cur = el;
    for (let i = 0; i < n && cur && cur.parentElement; i++) cur = cur.parentElement;
    return cur || el;
  };

  const safeQuery = (sel, root) => {
    if (!sel) return [];
    try { return Array.from((root || document).querySelectorAll(sel)); } catch (e) { return []; }
  };

  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));

  /* ------------------------------------------------------------ id lookup */
  function extractId(el, c) {
    const conf = c || cfg;
    if (!conf) return null;
    return norm(conf.mode === 'attr' ? el.getAttribute(conf.attr) : el.textContent);
  }

  /* ------------------------------------------------------------- painting */
  function clearAll(cls) {
    for (const el of safeQuery('.' + cls)) {
      el.classList.remove(cls);
      if (cls === HIT) el.removeAttribute('data-alertgreen-id');
    }
  }

  function scan() {
    stats = { candidates: 0, ids: 0, hits: 0 };
    if (!enabled || !cfg || !cfg.matchSelector) { clearAll(HIT); updatePanelStats(); return stats; }

    const seen = new Set();
    for (const el of safeQuery(cfg.matchSelector)) {
      stats.candidates++;
      const id = extractId(el);
      if (!id) continue;
      stats.ids++;
      const target = up(el, cfg.highlightUp || 0);
      seen.add(target);
      if (idSet.has(id)) {
        stats.hits++;
        target.classList.add(HIT);
        target.setAttribute('data-alertgreen-id', id);
      } else {
        target.classList.remove(HIT);
        target.removeAttribute('data-alertgreen-id');
      }
    }

    for (const el of safeQuery('.' + HIT)) {
      if (!seen.has(el)) {
        el.classList.remove(HIT);
        el.removeAttribute('data-alertgreen-id');
      }
    }
    updatePanelStats();
    return stats;
  }

  function queueScan() {
    if (rescanQueued) return;
    rescanQueued = true;
    const run = () => {
      if (!rescanQueued) return;
      rescanQueued = false;
      scan();
    };
    requestAnimationFrame(run);
    setTimeout(run, 250);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.attributeName === 'class') continue;
        queueScan();
        return;
      }
    });
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true
    });
  }

  /* -------------------------------------------------------- config guesser */
  const TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9._\-]{2,63}/;
  const OURS = /^data-alertgreen/i;

  const looksLikeId = (v) => {
    if (!v) return false;
    const s = String(v).trim();
    if (s.length < 3 || s.length > 64) return false;
    if (/\s/.test(s)) return false;
    return TOKEN_RE.test(s);
  };

  function cssPathFor(el) {
    const parts = [el.tagName.toLowerCase()];
    for (const a of el.attributes) {
      if (/^data-/i.test(a.name) && !looksLikeId(a.value)) parts.push('[' + a.name + ']');
    }
    const role = el.getAttribute('role');
    if (role) parts.push('[role="' + role + '"]');
    const raw = (typeof el.className === 'string') ? el.className : '';
    const cls = raw.split(/\s+/).filter((c) =>
      c && !c.startsWith('alertgreen') && !/\d{4,}/.test(c) && c.length < 40
    );
    if (cls.length) parts.push('.' + cls.slice(0, 2).join('.'));
    return parts.join('');
  }

  function scoreCandidate(c) {
    const els = safeQuery(c.matchSelector);
    let ids = 0, hits = 0;
    const samples = [];
    for (const el of els.slice(0, 4000)) {
      const id = extractId(el, c);
      if (!id) continue;
      ids++;
      if (samples.length < 3) samples.push(id);
      if (idSet.has(id)) hits++;
    }
    return Object.assign({}, c, { found: els.length, ids: ids, hits: hits, samples: samples });
  }

  function buildCandidates(clicked) {
    const out = [];
    const seen = new Set();
    const push = (c) => {
      const key = JSON.stringify([c.mode, c.matchSelector, c.attr]);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(c);
    };

    // 1. Attributes on the clicked element and its ancestors holding id-ish values.
    let el = clicked;
    for (let depth = 0; el && depth < 10; depth++, el = el.parentElement) {
      for (const a of (el.attributes || [])) {
        if (a.name === 'class' || a.name === 'style') continue;
        if (OURS.test(a.name)) continue;          // never propose our own bookkeeping
        if (!looksLikeId(a.value)) continue;
        push(Object.assign({}, DEFAULT_CFG, {
          mode: 'attr',
          matchSelector: el.tagName.toLowerCase() + '[' + a.name + ']',
          attr: a.name,
          highlightUp: 0,
          _local: true,
          _why: 'attribute ' + a.name + '="' + a.value + '", ' + depth + ' level(s) above the click'
        }));
      }
    }

    // 2. Any attribute anywhere on the page whose NAME mentions alert/case/id.
    const nameHint = /(alert|incident|case|ticket|item|row)[-_]?id$|^data-.*id$/i;
    const attrNames = new Set();
    for (const node of safeQuery('[id], [data-id], [role="row"], tr, li')) {
      for (const a of node.attributes) {
        if (OURS.test(a.name)) continue;
        if (nameHint.test(a.name) && looksLikeId(a.value)) attrNames.add(a.name);
      }
      if (attrNames.size > 12) break;
    }
    for (const name of attrNames) {
      push(Object.assign({}, DEFAULT_CFG, {
        mode: 'attr', matchSelector: '[' + name + ']', attr: name,
        _why: 'page-wide scan found attribute ' + name
      }));
    }

    // 3. Text mode: the clicked element's whole text is the id.
    const forSelector = (sel, upN, why) => {
      push(Object.assign({}, DEFAULT_CFG, {
        mode: 'text', matchSelector: sel, highlightUp: upN,
        _local: true, _why: why
      }));
    };
    let node = clicked;
    for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      const sel = cssPathFor(node);
      if (safeQuery(sel).length >= 1) forSelector(sel, 0, 'whole text of "' + sel + '"');
    }
    // Same column of a table: nth-child is often the most reliable handle.
    const cell = clicked.closest('td, th, [role="gridcell"], [role="cell"]');
    if (cell && cell.parentElement) {
      const idx = Array.from(cell.parentElement.children).indexOf(cell) + 1;
      forSelector(cell.tagName.toLowerCase() + ':nth-child(' + idx + ')', 1,
        'whole text of column ' + idx);
    }

    const precision = (c) => (c.ids ? c.hits / c.ids : 0);
    return out
      .map(scoreCandidate)
      .filter((c) => c.ids > 0)
      .sort((a, b) =>
        (b.hits - a.hits) ||
        ((b._local ? 1 : 0) - (a._local ? 1 : 0)) ||   // trust what was clicked
        (precision(b) - precision(a)) ||
        ((a.mode === 'attr' ? 0 : 1) - (b.mode === 'attr' ? 0 : 1)) ||
        (b.ids - a.ids) ||
        (a.found - b.found))
      .slice(0, 6);
  }

  /* -------------------------------------------------------------- panel UI */

  let panelHost = null, panelRoot = null, candidates = [], chosen = null;

  const PANEL_CSS = [
    ':host { all: initial; }',
    '.wrap { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;',
    '  width: 390px; max-height: 72vh; overflow: auto; background: #fff; color: #202124;',
    '  font: 13px/1.45 "Segoe UI", system-ui, sans-serif; border: 1px solid #dadce0;',
    '  border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.24); padding: 12px 14px; }',
    'h1 { font-size: 14px; margin: 0 0 8px; display: flex; justify-content: space-between; align-items: center; }',
    'button { font: inherit; padding: 5px 10px; margin: 2px 4px 2px 0; border: 1px solid #dadce0;',
    '  background: #f8f9fa; border-radius: 6px; cursor: pointer; }',
    'button:hover { background: #e8f0fe; }',
    'button.primary { background: #1e8e3e; color: #fff; border-color: #1e8e3e; }',
    'button.x { border: none; background: none; font-size: 16px; padding: 0 4px; }',
    '.stat { background: #f1f3f4; border-radius: 6px; padding: 8px; margin: 8px 0; }',
    '.cand { border: 1px solid #dadce0; border-radius: 8px; padding: 8px; margin: 6px 0; }',
    '.cand.sel { border-color: #1e8e3e; background: #f2fbf2; }',
    'code { background: #f1f3f4; padding: 1px 4px; border-radius: 3px; font-size: 11.5px; word-break: break-all; }',
    '.muted { color: #5f6368; font-size: 11.5px; }',
    '.hits { color: #1e8e3e; font-weight: 600; }',
    '.warn { color: #c5221f; }',
    '.snip { background:#f1f3f4; padding:8px; border-radius:6px; font-size:11px;',
    '  white-space:pre-wrap; user-select:all; margin:6px 0 0; }'
  ].join('\n');

  function ensurePanel() {
    if (panelHost) return;
    panelHost = document.createElement('div');
    panelHost.id = 'alertgreen-panel-host';
    panelRoot = panelHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    panelRoot.appendChild(style);
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    panelRoot.appendChild(wrap);
    document.documentElement.appendChild(panelHost);
    renderPanel();
  }

  function togglePanel(show) {
    if (show === false) {
      if (panelHost) panelHost.remove();
      panelHost = null; panelRoot = null;
      return;
    }
    if (panelHost && show !== true) {
      panelHost.remove(); panelHost = null; panelRoot = null;
      return;
    }
    ensurePanel();
  }

  function liveHtml() {
    if (!cfg || !cfg.matchSelector) {
      return '<span class="warn">No rule yet - click "Pick an alert ID" below.</span>';
    }
    return 'Elements matched: <b>' + stats.candidates + '</b> &nbsp;|&nbsp; IDs read: <b>' + stats.ids + '</b>' +
           '<br>Green (on bulk-close list): <b class="hits">' + stats.hits + '</b>';
  }

  function updatePanelStats() {
    if (!panelRoot) return;
    const el = panelRoot.querySelector('#live');
    if (el) el.innerHTML = liveHtml();
  }

  function describeCfg(c) {
    if (c.mode === 'attr') return c.matchSelector + ' -> attribute ' + c.attr + ' (exact)';
    return c.matchSelector + ' -> whole cell text (exact)';
  }

  function renderPanel() {
    if (!panelRoot) return;
    const wrap = panelRoot.querySelector('.wrap');
    const cfgHtml = (cfg && cfg.matchSelector)
      ? '<div class="muted">Current rule: <code>' + escapeHtml(describeCfg(cfg)) + '</code></div>'
      : '';
    wrap.innerHTML =
      '<h1>Alert Highlighter <button class="x" id="close">&times;</button></h1>' +
      '<div class="stat">List loaded: <b>' + idSet.size.toLocaleString() + '</b> alert IDs<br>' +
      '<span id="live">' + liveHtml() + '</span></div>' +
      cfgHtml +
      '<div><button class="primary" id="pick">Pick an alert ID</button>' +
      '<button id="rescan">Rescan</button>' +
      '<button id="wider">Widen &#9650;</button>' +
      '<button id="narrow">Narrow &#9660;</button></div>' +
      '<div class="muted">Widen/Narrow change how much of the row gets coloured (now ' +
      (cfg ? (cfg.highlightUp || 0) : 0) + ' level(s) up from the ID element).</div>' +
      '<div><label><input type="checkbox" id="cs"' +
      ((cfg && cfg.caseSensitive) ? ' checked' : '') +
      '> Case-sensitive matching</label></div>' +
      ((cfg && cfg.matchSelector)
        ? '<div><button id="copycfg">Copy rule for config.js</button></div>' +
          '<pre id="cfgout" class="snip" style="display:none"></pre>'
        : '') +
      '<div id="cands"></div>';
    wrap.querySelector('#cs').onchange = (e) => setCaseSensitive(e.target.checked);
    const copyBtn = wrap.querySelector('#copycfg');
    if (copyBtn) copyBtn.onclick = copyRuleSnippet;
    wrap.querySelector('#close').onclick = () => togglePanel(false);
    wrap.querySelector('#pick').onclick = startPicking;
    wrap.querySelector('#rescan').onclick = () => scan();
    wrap.querySelector('#wider').onclick = () => bumpHighlight(1);
    wrap.querySelector('#narrow').onclick = () => bumpHighlight(-1);
    renderCandidates();
  }

  function renderCandidates() {
    if (!panelRoot) return;
    const box = panelRoot.querySelector('#cands');
    if (!box) return;
    if (!candidates.length) { box.innerHTML = ''; return; }
    box.innerHTML =
      '<div class="muted" style="margin-top:8px">Ways to read the alert ID, best first:</div>' +
      candidates.map((c, i) =>
        '<div class="cand ' + (chosen === i ? 'sel' : '') + '">' +
        '<code>' + escapeHtml(describeCfg(c)) + '</code><br>' +
        '<span class="muted">' + escapeHtml(c._why || '') + '</span><br>' +
        'matched ' + c.found + ' elements, read ' + c.ids + ' IDs, ' +
        '<span class="hits">' + c.hits + ' on the close list</span><br>' +
        '<span class="muted">e.g. ' + escapeHtml(c.samples.join(', ') || '-') + '</span><br>' +
        '<button data-try="' + i + '">Preview</button>' +
        '<button class="primary" data-use="' + i + '">Use this</button>' +
        '</div>'
      ).join('');
    box.querySelectorAll('[data-try]').forEach((b) => {
      b.onclick = () => previewCandidate(candidates[Number(b.dataset.try)]);
    });
    box.querySelectorAll('[data-use]').forEach((b) => {
      b.onclick = () => useCandidate(Number(b.dataset.use));
    });
  }

  function previewCandidate(c) {
    clearAll(PREVIEW);
    for (const el of safeQuery(c.matchSelector).slice(0, 500)) {
      up(el, c.highlightUp || 0).classList.add(PREVIEW);
    }
    setTimeout(() => clearAll(PREVIEW), 2500);
  }

  function useCandidate(i) {
    chosen = i;
    const c = candidates[i];
    cfg = {
      mode: c.mode,
      matchSelector: c.matchSelector,
      attr: c.attr,
      highlightUp: c.highlightUp || 0,
      caseSensitive: !!(cfg && cfg.caseSensitive)
    };
    saveCfg();
    scan();
    renderPanel();
  }

  function copyRuleSnippet() {
    const snip =
      '  rule: {\n' +
      "    mode: '" + cfg.mode + "',\n" +
      "    matchSelector: '" + String(cfg.matchSelector).replace(/'/g, "\\'") + "',\n" +
      "    attr: '" + (cfg.attr || '') + "',\n" +
      '    highlightUp: ' + (cfg.highlightUp || 0) + '\n' +
      '  },\n' +
      '  caseSensitive: ' + !!cfg.caseSensitive + ',';
    const out = panelRoot && panelRoot.querySelector('#cfgout');
    if (out) { out.textContent = snip; out.style.display = ''; }
    try {
      navigator.clipboard.writeText(snip)
        .then(() => toast('Rule copied - paste it into config.js'))
        .catch(() => toast('Copy blocked; select the text below instead'));
    } catch (e) {
      toast('Copy blocked; select the text below instead');
    }
  }

  function setCaseSensitive(on) {
    if (!cfg) return;
    cfg.caseSensitive = !!on;
    rebuildIdSet();
    saveCfg();
    scan();
    renderPanel();
  }

  function bumpHighlight(delta) {
    if (!cfg) return;
    cfg.highlightUp = Math.max(0, Math.min(10, (cfg.highlightUp || 0) + delta));
    clearAll(HIT);
    saveCfg();
    scan();
    renderPanel();
  }

  function saveCfg() {
    chrome.storage.local.set({ cfg: cfg });
  }

  /* ------------------------------------------------------------ the picker */
  let picking = false, hovered = null;

  function startPicking() {
    picking = true;
    togglePanel(false);
    document.addEventListener('mouseover', onPickHover, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onPickKey, true);
    toast('Click the alert ID text on the page. Esc to cancel.');
  }

  function stopPicking() {
    picking = false;
    if (hovered && hovered.classList) hovered.classList.remove(HOVER);
    hovered = null;
    document.removeEventListener('mouseover', onPickHover, true);
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('keydown', onPickKey, true);
  }

  function onPickHover(e) {
    if (!picking) return;
    if (hovered && hovered.classList) hovered.classList.remove(HOVER);
    hovered = e.target;
    if (hovered && hovered.classList) hovered.classList.add(HOVER);
  }

  function onPickKey(e) {
    if (picking && e.key === 'Escape') { stopPicking(); ensurePanel(); }
  }

  function onPickClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    stopPicking();
    candidates = buildCandidates(target);
    chosen = null;
    ensurePanel();
    renderPanel();
    if (!candidates.length) {
      toast('Nothing id-shaped there. Try clicking directly on the ID text.');
    }
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);' +
      'z-index:2147483647;background:#202124;color:#fff;padding:8px 14px;border-radius:6px;' +
      'font:13px system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.3)';
    document.documentElement.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  /* ---------------------------------------------------------------- wiring */
  function rebuildIdSet() {
    idSet = new Set();
    if (!rawIds) return;
    const fold = !(cfg && cfg.caseSensitive);
    for (const line of rawIds.split('\n')) {
      const s = line.replace(/\s+/g, ' ').trim();
      if (!s) continue;
      idSet.add(fold ? s.toUpperCase() : s);
    }
  }

  function loadIds(raw) {
    rawIds = raw || '';
    rebuildIdSet();
  }

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type === 'stats') {
      reply({
        candidates: stats.candidates, ids: stats.ids, hits: stats.hits,
        listSize: idSet.size, cfg: cfg, enabled: enabled, url: location.href
      });
    } else if (msg.type === 'panel') {
      togglePanel(true);
      reply({ ok: true });
    } else if (msg.type === 'rescan') {
      reply(scan());
    } else if (msg.type === 'clearCfg') {
      cfg = Object.assign({}, DEFAULT_CFG);
      clearAll(HIT);
      saveCfg();
      renderPanel();
      reply({ ok: true });
    }
    return true;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.alertIds) { loadIds(changes.alertIds.newValue); scan(); }
    if (changes.cfg) {
      cfg = changes.cfg.newValue;
      rebuildIdSet();          // case-sensitivity may have flipped
      clearAll(HIT);
      scan();
    }
    if (changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (!enabled) clearAll(HIT); else scan();
    }
    if (panelRoot) renderPanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey && e.shiftKey && (e.key === 'g' || e.key === 'G')) togglePanel();
  });

  chrome.storage.local.get(['alertIds', 'cfg', 'enabled'], (data) => {
    const baked = (typeof AG_CONFIG !== 'undefined' && AG_CONFIG.rule)
      ? Object.assign({}, DEFAULT_CFG, AG_CONFIG.rule,
          { caseSensitive: !!AG_CONFIG.caseSensitive })
      : null;
    cfg = data.cfg || baked || Object.assign({}, DEFAULT_CFG);
    loadIds(data.alertIds);
    enabled = data.enabled !== false;
    scan();
    startObserver();
    if (!cfg.matchSelector) ensurePanel();
  });
})();
