import { browser } from 'wxt/browser';

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

const FALLBACK_ICON = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="%23ccc"/></svg>';

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

async function render(): Promise<void> {
  const container = document.getElementById('container');
  if (!container) return;
  
  container.innerHTML = '';

  const { tabGroups: groups } = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: TabGroup[] };
  
  if (groups.length === 0) {
    container.innerHTML = '<p class="empty">🧹</p>';
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

    summary.querySelector('.restore-all-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLButtonElement;
      restoreGroup(Number(target.dataset.id));
    });

    summary.querySelector('.delete-group-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLButtonElement;
      deleteGroup(Number(target.dataset.id));
    });

    details.appendChild(summary);

    const ul = document.createElement('ul');
    ul.setAttribute('role', 'list');
    
    group.tabs.forEach((tab: Tab, index: number) => {
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
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        window.open(tab.url, '_blank', 'noopener,noreferrer');
        await deleteTab(group.id, index);
        render();
      });
      
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.ariaLabel = 'Delete tab';
      btn.textContent = '✕';
      btn.addEventListener('click', async () => {
        await deleteTab(group.id, index);
        render();
      });
      
      li.appendChild(img);
      li.appendChild(a);
      li.appendChild(btn);
      ul.appendChild(li);
    });

    details.appendChild(ul);
    container.appendChild(details);
  }
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

document.getElementById('exportBtn')?.addEventListener('click', exportData);
document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('fileInput')?.click());
document.getElementById('fileInput')?.addEventListener('change', importData);
