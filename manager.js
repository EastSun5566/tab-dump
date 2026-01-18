async function render() {
  const container = document.getElementById('container');
  container.innerHTML = '';

  const result = await chrome.storage.local.get({ tabGroups: [] });
  const groups = result.tabGroups;
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">No saved tabs yet.</p>';
    return;
  }

  groups.forEach((group, groupIndex) => {
    const details = document.createElement('details');
    details.open = true;
    details.setAttribute('aria-label', `Tab group from ${group.date}`);

    const summary = document.createElement('summary');
    summary.innerHTML = `
      ${group.date} (${group.tabs.length} tabs)
      <button type="button" class="restore-all-btn" data-id="${group.id}" aria-label="Restore all ${group.tabs.length} tabs from this group">Restore All</button>
      <button type="button" class="delete-group-btn" data-id="${group.id}" aria-label="Delete this group">Delete</button>
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
      const iconSrc = getFaviconUrl(tab.url);

      li.innerHTML = `
        <img src="${iconSrc}" alt="" role="presentation">
        <a href="${tab.url}" target="_blank" rel="noopener noreferrer" data-group-id="${group.id}" data-tab-index="${index}">${tab.title}</a>
        <button type="button" data-group-id="${group.id}" data-tab-index="${index}" aria-label="Delete ${tab.title}">✕</button>
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
  });
}

async function restoreGroup(id) {
  const result = await chrome.storage.local.get({ tabGroups: [] });
  const group = result.tabGroups.find(g => g.id === id);
  if (group) {
    for (const tab of group.tabs) {
      chrome.tabs.create({ url: tab.url, active: false });
    }
    await deleteGroup(id);
  }
}

async function deleteGroup(id) {
  const result = await chrome.storage.local.get({ tabGroups: [] });
  const newGroups = result.tabGroups.filter(g => g.id !== id);
  await chrome.storage.local.set({ tabGroups: newGroups });
  render();
}

async function deleteTab(groupId, tabIndex) {
  const result = await chrome.storage.local.get({ tabGroups: [] });
  const groups = result.tabGroups;
  const groupIndex = groups.findIndex(g => g.id === groupId);

  if (groupIndex !== -1) {
    groups[groupIndex].tabs.splice(tabIndex, 1);
    if (groups[groupIndex].tabs.length === 0) {
      groups.splice(groupIndex, 1);
    }
    await chrome.storage.local.set({ tabGroups: groups });
  }
}

function getFaviconUrl(pageUrl) {
  try {
    const url = new URL(chrome.runtime.getURL("/_favicon/"));
    url.searchParams.set("pageUrl", pageUrl);
    url.searchParams.set("size", "32");
    return url.toString();
  } catch (e) {
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTAgMGgyNHYyNEgwVjB6IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTEyIDJDMiAyIDIgMTIgMiAxMnMyIDEwIDEwIDEwIDEwLTEwIDEwLTEwUzIyIDIgMTIgMnptMCAxOGMtNC40MSAwLTgtMy41OS04LThzMy41OS04IDgtOCA4IDMuNTkgOCA4LTMuNTkgOC04IDh6IiBmaWxsPSIjY2NjIi8+PC9zdmc+';
  }
}

async function exportData() {
  const data = await chrome.storage.local.get({ tabGroups: [] });
  const exportData = {
    tabGroups: data.tabGroups,
    exportedAt: new Date().toISOString(),
    version: "1.0"
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `tabdump-backup-${new Date().toISOString().slice(0,10)}.json`;
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
        alert("Invalid file format: missing tabGroups array");
        return;
      }
      
      const existingData = await chrome.storage.local.get({ tabGroups: [] });
      const mergedGroups = [...json.tabGroups, ...existingData.tabGroups];
      
      await chrome.storage.local.set({ tabGroups: mergedGroups });
      render();
      alert(`Import successful! Added ${json.tabGroups.length} groups`);
    } catch (err) {
      alert("Invalid file format: " + err.message);
    }
  };
  reader.readAsText(file);

  event.target.value = '';
}

render();

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});
document.getElementById('fileInput').addEventListener('change', importData);
