/* The only file you normally edit. */
const AG_CONFIG = {

  rule: {
    mode: 'attr',                 // 'attr' = read an HTML attribute, 'text' = read the element's text
    matchSelector: 'div[title]',  // which elements hold an alert ID
    attr: 'title',                // which attribute (ignored when mode is 'text')
    highlightUp: 0                // 0 = colour that element; 1 = colour its parent, etc.
  },

  caseSensitive: false,

  listFile: 'lists/alerts.txt'
};
