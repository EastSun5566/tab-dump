import { browser } from 'wxt/browser';
import { clusterTabs, TabItem } from '@/utils/clustering';

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

type ViewMode = 'timeline' | 'grouped';
let currentView: ViewMode = 'timeline';

const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23ccc"/></svg>';

// Group all tabs using TF-IDF Clustering
function groupTabsByClustering(groups: TabGroup[]): Map<string, Tab[]> {
  // Flatten all tabs into TabItems with tracking info
  const allTabs: TabItem[] = [];
  groups.forEach((g, gIndex) => {
    g.tabs.forEach((t, tIndex) => {
      allTabs.push({
        id: `${g.id}-${tIndex}`,
        title: t.title || '',
        url: t.url || '',
        originalGroupIndex: g.id, // We store ID here, though name says Index (legacy)
        originalTabIndex: tIndex
      });
    });
  });

  const clusters = clusterTabs(allTabs);
  
  const result = new Map<string, Tab[]>();
  for (const [name, items] of clusters) {
    const tabs: Tab[] = items.map(item => ({
      title: item.title,
      url: item.url,
      favIconUrl: findFavicon(groups, item.originalGroupIndex, item.originalTabIndex)
    }));
    result.set(name, tabs);
  }
  
  return result;
}

function findFavicon(groups: TabGroup[], groupId: number, tabIndex: number): string | undefined {
  const group = groups.find(g => g.id === groupId);
  return group?.tabs[tabIndex]?.favIconUrl;
}

function getFaviconUrl(tab: Tab): string {
  if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome://')) {
    return tab.favIconUrl;
  }
  
  try {
    const url = new URL((browser.runtime.getURL as (path: string) => string)("/_favicon/"));
    url.searchParams.set("pageUrl", tab.url || "");
    url.searchParams.set("size", "32");
    return url.toString();
  } catch {
    try {
      const domain = new URL(tab.url || "").hostname;
      return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    } catch {
      return FALLBACK_ICON;
    }
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
  a.href = tab.url || '';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = tab.title || '';
  a.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(tab.url, '_blank', 'noopener,noreferrer');
  });
  
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.ariaLabel = 'Delete tab';
  btn.textContent = '✕';
  if (onDelete) {
    btn.addEventListener('click', onDelete);
  }
  
  li.appendChild(img);
  li.appendChild(a);
  li.appendChild(btn);
  return li;
}

async function renderTimeline(): Promise<void> {
  const container = document.getElementById('container');
  if (!container) return;
  
  container.innerHTML = '';

  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">No tabs.</p>';
    return;
  }

  for (const group of groups) {
    const details = document.createElement('details');
    details.open = true;
    details.setAttribute('aria-label', `Tab group from ${group.date}`);

    const summary = document.createElement('summary');
    summary.innerHTML = `
      <span class="title-text">${group.date} (${group.tabs.length})</span>
      <button type="button" class="restore-all-btn" data-id="${group.id}">Restore All</button>
      <button type="button" class="delete-group-btn" data-id="${group.id}">Delete</button>
    `;

    summary.querySelector('.restore-all-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLButtonElement;
      restoreGroup(Number(target.dataset.id));
    });

    summary.querySelector('.delete-group-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLButtonElement;
      if (confirm(`Delete group from ${group.date}?`)) {
        deleteGroup(Number(target.dataset.id));
      }
    });

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    
    group.tabs.forEach((tab: Tab, index: number) => {
      const li = createTabElement(tab, async () => {
        await deleteTab(group.id, index);
        render();
      });
      ul.appendChild(li);
    });

    details.appendChild(ul);
    container.appendChild(details);
  }
}

async function renderGrouped(): Promise<void> {
  const container = document.getElementById('container');
  if (!container) return;
  
  container.innerHTML = '';

  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">No tabs.</p>';
    return;
  }

  const keywordGroups = groupTabsByClustering(groups);
  
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
        browser.tabs.create({ url: tab.url, active: false });
      }
      await deleteKeywordGroup(tabs);
    });

    summary.querySelector('.delete-group-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete all ${tabs.length} tabs in "${keyword}"?`)) {
        await deleteKeywordGroup(tabs);
      }
    });
    
    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    
    for (const tab of tabs) {
      const li = createTabElement(tab, async () => {
        // Find the original group and index for this tab
        const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
        for (const group of groups) {
          const index = group.tabs.findIndex(t => t.url === tab.url && t.title === tab.title);
          if (index !== -1) {
            await deleteTab(group.id, index);
            render();
            return;
          }
        }
      });
      ul.appendChild(li);
    }

    details.appendChild(ul);
    container.appendChild(details);
  }
}

async function deleteKeywordGroup(tabsToDelete: Tab[]): Promise<void> {
  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  
  for (const tab of tabsToDelete) {
    // We need to find and remove each tab individually from its source group
    for (const group of groups) {
      const index = group.tabs.findIndex(t => t.url === tab.url && t.title === tab.title);
      if (index !== -1) {
        group.tabs.splice(index, 1);
        // If group becomes empty, it will be removed in the next cleanup or save
        break; 
      }
    }
  }

  const cleanedGroups = groups.filter(g => g.tabs.length > 0);
  await browser.storage.local.set({ tabGroups: cleanedGroups });
  render();
}

async function render(): Promise<void> {
  if (currentView === 'timeline') {
    await renderTimeline();
  } else {
    await renderGrouped();
  }
}

function setView(view: ViewMode): void {
  currentView = view;
  document.getElementById('timelineBtn')?.classList.toggle('active', view === 'timeline');
  document.getElementById('groupedBtn')?.classList.toggle('active', view === 'grouped');
  render();
}

async function restoreGroup(id: number): Promise<void> {
  const { tabGroups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  const group = tabGroups.find((g: TabGroup) => g.id === id);
  if (group) {
    for (const tab of group.tabs) {
      browser.tabs.create({ url: tab.url, active: false });
    }
    await deleteGroup(id);
  }
}

async function deleteGroup(id: number): Promise<void> {
  const { tabGroups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  await browser.storage.local.set({ tabGroups: tabGroups.filter((g: TabGroup) => g.id !== id) });
  render();
}

async function deleteTab(groupId: number, tabIndex: number): Promise<void> {
  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  const groupIndex = groups.findIndex((g: TabGroup) => g.id === groupId);

  if (groupIndex !== -1) {
    groups[groupIndex].tabs.splice(tabIndex, 1);
    if (groups[groupIndex].tabs.length === 0) {
      groups.splice(groupIndex, 1);
    }
    await browser.storage.local.set({ tabGroups: groups });
  }
}

async function exportData(): Promise<void> {
  const { tabGroups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
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

async function importData(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const result = e.target?.result;
      if (typeof result !== 'string') return;
      
      const json = JSON.parse(result);
      if (!json.tabGroups || !Array.isArray(json.tabGroups)) {
        alert("Invalid file format");
        return;
      }
      
      const { tabGroups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
      await browser.storage.local.set({ tabGroups: [...json.tabGroups, ...tabGroups] });
      render();
      alert(`Imported ${json.tabGroups.length} groups`);
    } catch {
      alert("Invalid file format");
    }
  };
  reader.readAsText(file);
  input.value = '';
}

render();

document.getElementById('timelineBtn')?.addEventListener('click', () => setView('timeline'));
document.getElementById('groupedBtn')?.addEventListener('click', () => setView('grouped'));
document.getElementById('exportBtn')?.addEventListener('click', exportData);
document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
document.getElementById('fileInput')?.addEventListener('change', importData);
