'use strict';

const $ = (id) => document.getElementById(id);

function activeTab() {
  return new Promise((res) =>
    chrome.tabs.query({ active: true, currentWindow: true }, (t) => res(t[0])));
}

function askTab(tabId, msg) {
  return new Promise((res) => {
    chrome.tabs.sendMessage(tabId, msg, (r) => {
      void chrome.runtime.lastError;      // not our site, or page not reloaded yet
      res(r || null);
    });
  });
}

function askWorker(msg) {
  return new Promise((res) => {
    chrome.runtime.sendMessage(msg, (r) => {
      void chrome.runtime.lastError;
      res(r || null);
    });
  });
}

async function show() {
  const data = await askWorker({ type: 'getIds' });
  $('count').textContent = data ? data.ids.length.toLocaleString() : '0';
  $('msg').textContent = data ? 'read from ' + data.files + ' list file(s)' : '';

  const tab = await activeTab();
  const s = tab ? await askTab(tab.id, { type: 'stats' }) : null;
  $('page').innerHTML = s
    ? '<span class="green">' + s.hits + '</span> to close on this page, of ' +
      s.rows + ' shown'
    : 'Not on the workflow system.';
}

$('refresh').addEventListener('click', async () => {
  $('refresh').disabled = true;
  $('refresh').textContent = 'Refreshing…';
  await askWorker({ type: 'refresh' });
  $('refresh').disabled = false;
  $('refresh').textContent = 'Refresh';
  show();
});

show();
