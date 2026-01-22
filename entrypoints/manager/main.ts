import { browser } from 'wxt/browser';
import { clusterTabs, TabItem } from './utils/clustering';

interface Tab {
  title?: string;
  url?: string;
  favIconUrl?: string;
}

interface TabGroup {
  id: number;
  date: string;
  tabs: Tab[];
}

interface TabWithMeta extends Tab {
  groupId: number;
  tabIndex: number;
}

type ViewMode = 'timeline' | 'grouped';
let currentView: ViewMode = 'timeline';

const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23ccc"/></svg>';


let cachedGroups: TabGroup[] | null = null;

async function getTabGroups(forceRefresh = false): Promise<TabGroup[]> {
  if (!forceRefresh && cachedGroups) {
    return cachedGroups;
  }
  
  try {
    const result = await browser.storage.local.get({ tabGroups: [] });
    const groups = (result as { tabGroups: TabGroup[] }).tabGroups;
    cachedGroups = groups;
    return groups;
  } catch (error) {
    console.error('Failed to load tab groups:', error);
    return [];
  }
}

async function saveTabGroups(groups: TabGroup[]) {
  try {
    const cleaned = groups.filter(g => g.tabs.length > 0);
    await browser.storage.local.set({ tabGroups: cleaned });
    cachedGroups = cleaned;
  } catch (error) {
    console.error('Failed to save tab groups:', error);
    alert('Failed to save changes. Please try again.');
  }
}


function groupTabsByClustering(groups: TabGroup[]): Map<string, TabWithMeta[]> {
  // Flatten all tabs
  const allTabs: TabItem[] = [];
  
  for (const group of groups) {
    for (let i = 0; i < group.tabs.length; i++) {
      const tab = group.tabs[i];
      allTabs.push({
        id: `${group.id}-${i}`,
        title: tab.title || '',
        url: tab.url || '',
        groupId: group.id,
        tabIndex: i
      });
    }
  }

  const clusters = clusterTabs(allTabs, {
    threshold: 0.15,
    minClusterSize: 2
  });
  
  const tabLookup = new Map<string, TabWithMeta>();
  for (const group of groups) {
    for (let i = 0; i < group.tabs.length; i++) {
      const tab = group.tabs[i];
      const key = `${group.id}-${i}`;
      tabLookup.set(key, {
        ...tab,
        groupId: group.id,
        tabIndex: i
      });
    }
  }
  
  const result = new Map<string, TabWithMeta[]>();
  for (const [name, items] of clusters) {
    const tabs: TabWithMeta[] = items
      .map(item => tabLookup.get(item.id))
      .filter((tab): tab is TabWithMeta => tab !== undefined);
    
    if (tabs.length > 0) {
      result.set(name, tabs);
    }
  }
  
  return result;
}


function getFaviconUrl(tab: Tab): string {
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    return tab.favIconUrl;
  }
  if (!tab.url) return FALLBACK_ICON;
  
  try {
    const domain = new URL(tab.url).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
  } catch {
    return FALLBACK_ICON;
  }
}

function createTabElement(tab: Tab, onDelete?: () => void): HTMLLIElement {
  const li = document.createElement('li');
  
  const img = document.createElement('img');
  img.src = getFaviconUrl(tab);
  img.alt = '';
  img.role = 'presentation';
  img.onerror = () => { img.src = FALLBACK_ICON; };
  
  const a = document.createElement('a');
  a.href = tab.url || '#';
  a.textContent = tab.title || 'Untitled';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (tab.url) {
      window.open(tab.url, '_blank', 'noopener,noreferrer');
    }
  });
  
  if (onDelete) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.ariaLabel = 'Delete tab';
    btn.textContent = '✕';
    btn.addEventListener('click', onDelete);
    li.append(img, a, btn);
  } else {
    li.append(img, a);
  }
  
  return li;
}

async function renderTimeline() {
  const container = document.getElementById('container');
  if (!container) return;
  
  container.innerHTML = '';
  const groups = await getTabGroups();
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">No tabs saved yet.</p>';
    return;
  }

  for (const group of groups) {
    const details = document.createElement('details');
    details.open = true;

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="title-text">${group.date} (${group.tabs.length})</span>
      <button type="button" class="restore-all-btn">Restore All</button>
      <button type="button" class="delete-group-btn">Delete</button>
    `;

    summary.querySelector('.restore-all-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      restoreGroup(group.id);
    });

    summary.querySelector('.delete-group-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete group from ${group.date}?`)) {
        deleteGroup(group.id);
      }
    });

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    
    group.tabs.forEach((tab, index) => {
      const li = createTabElement(tab, () => deleteTab(group.id, index));
      ul.appendChild(li);
    });

    details.appendChild(ul);
    container.appendChild(details);
  }
}

async function renderGrouped() {
  const container = document.getElementById('container');
  if (!container) return;
  
  container.innerHTML = '<p class="loading">Analyzing tabs...</p>';
  
  const groups = await getTabGroups();
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">No tabs saved yet.</p>';
    return;
  }

  const keywordGroups = groupTabsByClustering(groups);
  container.innerHTML = '';
  
  for (const [keyword, tabs] of keywordGroups) {
    const details = document.createElement('details');
    details.open = true;

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="title-text">📁 ${keyword} (${tabs.length})</span>
      <button type="button" class="restore-all-btn">Restore All</button>
      <button type="button" class="delete-group-btn">Delete</button>
    `;
    
    summary.querySelector('.restore-all-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      for (const tab of tabs) {
        if (tab.url) {
          await browser.tabs.create({ url: tab.url, active: false });
        }
      }
      await deleteTabs(tabs);
    });

    summary.querySelector('.delete-group-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete all ${tabs.length} tabs in "${keyword}"?`)) {
        await deleteTabs(tabs);
      }
    });
    
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    
    for (const tab of tabs) {
      const li = createTabElement(tab, () => deleteTab(tab.groupId, tab.tabIndex));
      ul.appendChild(li);
    }

    details.appendChild(ul);
    container.appendChild(details);
  }
}

async function render() {
  currentView === 'timeline' 
    ? await renderTimeline() 
    : await renderGrouped();
}

function setView(view: ViewMode) {
  currentView = view;
  document.getElementById('timelineBtn')?.classList.toggle('active', view === 'timeline');
  document.getElementById('groupedBtn')?.classList.toggle('active', view === 'grouped');
  render();
}

async function restoreGroup(id: number) {
  const groups = await getTabGroups();
  const group = groups.find(g => g.id === id);
  
  if (group) {
    for (const tab of group.tabs) {
      if (tab.url) {
        await browser.tabs.create({ url: tab.url, active: false });
      }
    }
    await deleteGroup(id);
  }
}

async function deleteGroup(id: number) {
  const groups = await getTabGroups(true);
  await saveTabGroups(groups.filter(g => g.id !== id));
  render();
}

async function deleteTab(groupId: number, tabIndex: number) {
  const groups = await getTabGroups(true);
  const group = groups.find(g => g.id === groupId);

  if (group && tabIndex >= 0 && tabIndex < group.tabs.length) {
    group.tabs.splice(tabIndex, 1);
    await saveTabGroups(groups);
    render();
  }
}

async function deleteTabs(tabsToDelete: TabWithMeta[]) {
  const groups = await getTabGroups(true);
  const toDelete = new Set(
    tabsToDelete.map(t => `${t.groupId}-${t.tabIndex}`)
  );
  
  for (const group of groups) {
    const indicesToRemove: number[] = [];
    for (let i = 0; i < group.tabs.length; i++) {
      if (toDelete.has(`${group.id}-${i}`)) {
        indicesToRemove.push(i);
      }
    }
    
    // Remove from the end to avoid index shifting
    for (let i = indicesToRemove.length - 1; i >= 0; i--) {
      group.tabs.splice(indicesToRemove[i], 1);
    }
  }

  await saveTabGroups(groups);
  render();
}

async function exportData() {
  const groups = await getTabGroups();
  const data = {
    tabGroups: groups,
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

async function importData(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const result = e.target?.result;
      if (typeof result !== 'string') {
        alert("Invalid file");
        return;
      }
      
      const json = JSON.parse(result);
      if (!json.tabGroups || !Array.isArray(json.tabGroups)) {
        alert("Invalid file format");
        return;
      }
      
      const groups = await getTabGroups(true);
      await saveTabGroups([...json.tabGroups, ...groups]);
      render();
      alert(`Imported ${json.tabGroups.length} group(s)`);
    } catch (error) {
      console.error('Import failed:', error);
      alert("Failed to import file");
    }
  };
  reader.readAsText(file);
  input.value = '';
}

render();

document.getElementById('timelineBtn')?.addEventListener('click', () => setView('timeline'));
document.getElementById('groupedBtn')?.addEventListener('click', () => setView('grouped'));
document.getElementById('exportBtn')?.addEventListener('click', exportData);
document.getElementById('importBtn')?.addEventListener('click', () => {
  document.getElementById('fileInput')?.click();
});
document.getElementById('fileInput')?.addEventListener('change', importData);
