chrome.action.onClicked.addListener(async (currentTab) => {
  // Skip incognito mode for privacy protection
  if (currentTab.incognito) {
    console.log("Incognito mode: skipping storage operation");
    return;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true, pinned: false });
  const tabsToSave = tabs.filter(t => !t.url.startsWith("chrome-extension://"));
  if (tabsToSave.length === 0) return;

  const newGroup = {
    id: Date.now(),
    date: new Date().toLocaleString(),
    tabs: tabsToSave.map(t => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl }))
  };

  const result = await chrome.storage.local.get({ tabGroups: [] });
  const updatedGroups = [newGroup, ...result.tabGroups];
  await chrome.storage.local.set({ tabGroups: updatedGroups });

  await chrome.tabs.create({ url: "manager.html" });
  
  const tabIds = tabsToSave.map(t => t.id);
  await chrome.tabs.remove(tabIds);
});
