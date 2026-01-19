export default defineBackground(() => {
  // Use browserAction for MV2 (Firefox) or action for MV3 (Chrome)
  const actionApi = browser.action || browser.browserAction;  
  actionApi.onClicked.addListener(async (currentTab) => {
    if (currentTab.incognito) return;

    const tabs = await browser.tabs.query({ currentWindow: true, pinned: false });
    const tabsToSave = tabs.filter(
      (t) => !t.url?.startsWith("chrome-extension://") && !t.url?.startsWith("moz-extension://")
    );
    if (tabsToSave.length === 0) return;

    const newGroup = {
      id: Date.now(),
      date: new Date().toLocaleString(),
      tabs: tabsToSave.map((t) => ({ title: t.title, url: t.url, favIconUrl: t.favIconUrl })),
    };

    const result = await browser.storage.local.get({ tabGroups: [] }) as { tabGroups: Array<typeof newGroup> };
    await browser.storage.local.set({ tabGroups: [newGroup, ...result.tabGroups] });

    await browser.tabs.create({ url: browser.runtime.getURL("/manager.html") });
    await browser.tabs.remove(tabsToSave.map((t) => t.id!));
  });
});
