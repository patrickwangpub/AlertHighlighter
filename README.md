# Alert Bulk-Close Highlighter (v2, bare bones)

Colours an alert green when its ID is on the bulk-close list.

159 lines across 5 files. **No permissions except access to the one site.** No
storage, no network requests, no file-system access, no remote code, and no user
interface. The alert list is a plain text file bundled inside the extension.

That paragraph is the whole security review.

---

## Install

1. `manifest.json` — replace `https://CHANGE-ME.your-company.internal/*` in
   **both** `host_permissions` and `content_scripts[0].matches`.
2. Put the real list in `lists/alerts.txt`.
3. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.

## How it matches

The rule is in `config.js`, already set to the one confirmed working on the
workflow system:

```js
rule: { mode: 'attr', matchSelector: 'div[title]', attr: 'title', highlightUp: 0 }
```

A row goes green only when the `title` attribute **equals** a list entry, after
whitespace is stripped and case is folded. `A1234` never highlights `A12345`,
`A123`, `XA1234` or `A1234 (High)`. There is no substring matching anywhere in
the code.

## Checking it works

There is nothing to click, so verify the way a user would:

**Open the workflow system, find an alert ID you know is on the list, and check
that it is green.** If it is, the whole chain is working — the extension loaded,
the file parsed, the rule matched, the CSS applied. If it isn't, see below.

Give users one known-good ID to check against. That single check covers every
failure mode at once, which is why this version has no status display.

## Updating the list

Two steps:

1. Replace `lists/alerts.txt` with the new list.
2. Reload the workflow page (F5).

No extension reload. The file may be comma separated, one ID per line, or both;
`#` starts a comment line. Duplicates are merged, so you don't have to keep it
clean.

This works because the background worker **re-reads the file on every request
and caches nothing**. That is deliberate: an in-memory cache would make F5
return a stale list whenever the worker happened to still be alive, and MV3
workers idle out after about 30 seconds, so the failure would be intermittent
and impossible to explain. Re-reading a local file costs a few milliseconds
once per page load.


## When the known-good ID isn't green

In order of likelihood:

1. **The page was loaded before the list changed.** F5.
2. **`lists/alerts.txt` is empty, missing, or wasn't actually replaced.** Open
   it and look. This is the most common cause and the least visible.
3. **The ID isn't really on the list.** Search the file for it. The match is
   exact: `A1234` in the file will not colour a cell reading `A1234 (High)`.
4. **The extension isn't running on this page.** `chrome://extensions` — is it
   enabled, and does the URL pattern in `manifest.json` cover the page you are
   actually on?
5. **The page markup changed.** In DevTools Console on the workflow page:


## Files

| File | Lines | Purpose |
|---|---|---|
| `config.js` | 22 | the rule, case sensitivity, list file name — **the only file you edit** |
| `background.js` | 37 | reads and parses the list file |
| `content.js` | 62 | matches and paints, re-scans when the grid redraws |
| `content.css` | 11 | the green |
| `manifest.json` | 27 | |
| `lists/alerts.txt` | — | the list |