import { browser } from 'wxt/browser';

const FALLBACK_ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTEyIDJDMiAyIDIgMTIgMiAxMnMyIDEwIDEwIDEwIDEwLTEwIDEwLTEwUzIyIDIgMTIgMnptMCAxOGMtNC40MSAwLTgtMy41OS04LThzMy41OS04IDgtOCA4IDMuNTkgOCA4LTMuNTkgOC04IDh6IiBmaWxsPSIjY2NjIi8+PC9zdmc+';

function getFaviconUrl(pageUrl) {
  try {
    const url = new URL(browser.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "32");
    return url.toString();
  } catch {
    return FALLBACK_ICON;
  }
}

async function render() {
  const container = document.getElementById('container');
  container.innerHTML = '';

  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] });
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">No saved tabs yet.</p>';
    return;
  }

  for (const group of groups) {
    const details = document.createElement('details');
    details.open = true;
    details.setAttribute('aria-label', `Tab group from ${group.date}`);

    const summary = document.createElement('summary');
    summary.innerHTML = `
      ${group.date} (${group.tabs.length} tabs)
      <button type="button" class="restore-all-btn" data-id="${group.id}" aria-label="Restore all tabs">Restore All</button>
      <button type="button" class="delete-group-btn" data-id="${group.id}" aria-label="Delete group">Delete</button>
    `;

    summary.querySelector('.restore-all-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      restoreGroup(Number(e.target.dataset.id));
    });

    summary.querySelector('.delete-group-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteGroup(Number(e.target.dataset.id));
    });

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    
    group.tabs.forEach((tab, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <img src="${getFaviconUrl(tab.url)}" alt="" role="presentation">
        <a href="${tab.url}" target="_blank" rel="noopener noreferrer">${tab.title}</a>
        <button type="button" aria-label="Delete tab">✕</button>
      `;
      
      li.querySelector('a').addEventListener('click', async (e) => {
        e.preventDefault();
        window.open(tab.url, '_blank', 'noopener,noreferrer');
        await deleteTab(group.id, index);
        render(); 
      });

      li.querySelector('button').addEventListener('click', async () => {
        await deleteTab(group.id, index);
        render();
      });

      ul.appendChild(li);
    });

    details.appendChild(ul);
    container.appendChild(details);
  }
}

async function restoreGroup(id) {
  const { tabGroups } = await browser.storage.local.get({ tabGroups: [] });
  const group = tabGroups.find(g => g.id === id);
  if (group) {
    for (const tab of group.tabs) {
      browser.tabs.create({ url: tab.url, active: false });
    }
    await deleteGroup(id);
  }
}

async function deleteGroup(id) {
  const { tabGroups } = await browser.storage.local.get({ tabGroups: [] });
  await browser.storage.local.set({ tabGroups: tabGroups.filter(g => g.id !== id) });
  render();
}

async function deleteTab(groupId, tabIndex) {
  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] });
  const groupIndex = groups.findIndex(g => g.id === groupId);

  if (groupIndex !== -1) {
    groups[groupIndex].tabs.splice(tabIndex, 1);
    if (groups[groupIndex].tabs.length === 0) {
      groups.splice(groupIndex, 1);
    }
    await browser.storage.local.set({ tabGroups: groups });
  }
}

async function exportData() {
  const { tabGroups } = await browser.storage.local.get({ tabGroups: [] });
  const data = {
    tabGroups,
    exportedAt: new Date().toISOString(),
    version: "1.0"
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tabdump-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);
      if (!json.tabGroups || !Array.isArray(json.tabGroups)) {
        alert("Invalid file format");
        return;
      }
      
      const { tabGroups } = await browser.storage.local.get({ tabGroups: [] });
      await browser.storage.local.set({ tabGroups: [...json.tabGroups, ...tabGroups] });
      render();
      alert(`Imported ${json.tabGroups.length} groups`);
    } catch {
      alert("Invalid file format");
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

render();

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('fileInput').click());
document.getElementById('fileInput').addEventListener('change', importData);
