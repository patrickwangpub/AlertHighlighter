/* The only file you normally edit. */
const AG_CONFIG = {
  rules: [
    // Rule 1: Alert Queue Grid View
    {
      mode: 'attr',
      matchSelector: 'div[title]',
      attr: 'title',
      highlightUp: 0
    },
    // Rule 2: Alert Detail / Top-Right Header View
    {
      mode: 'text',
      matchSelector: 'div.alert-name.dotted-notation',
      regex: /Alert\s*ID:\s*([A-Za-z0-9_-]+)/i, // extracts the ID after "Alert ID:"
      highlightUp: 0
    }
  ],

  caseSensitive: false,
  listFile: 'lists/alerts.txt'
};
