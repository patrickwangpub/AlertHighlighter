const AG_CONFIG = {
  siteLabel: 'the workflow system',
  listFolder: '\\\\CHANGE-ME-fileserver\\share\\bulk-close',
  autoRefreshHours: 8,
  rule: null,
  caseSensitive: false,
  simpleMode: true
};
if (typeof module !== 'undefined') module.exports = { AG_CONFIG };
