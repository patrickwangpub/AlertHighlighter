# Alert Bulk-Close Highlighter

Colours an alert green when its ID is on the bulk-close list.

**No permissions except access to the one site.** No
storage, no network requests, no file-system access, no remote code. The alert
lists are plain text files bundled inside the extension.

That last paragraph is the whole security review.

---

## Install

1. `manifest.json` — replace `https://CHANGE-ME.your-company.internal/*` in
   **both** `host_permissions` and `content_scripts[0].matches`.
2. Put the real list in `lists/alerts.txt`.
3. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.

## How it matches

The rule is in `config.js`

```js
rule: { mode: 'attr', matchSelector: 'div[title]', attr: 'title', highlightUp: 0 }
```

A row goes green only when the `title` attribute **equals** a list entry, after
whitespace is stripped and case is folded. `A1234` never highlights `A12345`,
`A123`, `XA1234` or `A1234 (High)`. There is no substring matching anywhere in
the code.

## Updating the list

Drop a new file into `lists/` named `update-1.txt`, then `update-2.txt`, and so
on up to `update-50.txt`. Click **Refresh** in the popup. Files may be comma
separated, one ID per line, or both; `#` starts a comment line. All files are
merged and de-duplicated.

There are no gaps to worry about: a missing `update-2.txt` doesn't stop
`update-3.txt` being read.

## Files

| File | Lines | Purpose |
|---|---|---|
| `config.js` | 26 | the rule, case sensitivity, list file names — **the only file you edit** |
| `background.js` | 64 | reads and merges the list files |
| `content.js` | 77 | matches and paints, re-scans when the grid redraws |
| `popup.js` | 50 | the count and the Refresh button |
| `popup.html` | 28 | |
| `content.css` | 11 | the green |
| `manifest.json` | 31 | |
| `lists/alerts.txt` | — | the shipped list |