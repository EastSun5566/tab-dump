import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "TabDump",
    version: "0.0.2",
    description: "Saving all open tabs to read later",
    permissions: ["tabs", "storage", "unlimitedStorage"],
    icons: {
      16: "/icons/icon16.png",
      48: "/icons/icon48.png",
      128: "/icons/icon128.png",
    },
    action: {
      default_title: "Saving all open tabs to read later",
      default_icon: {
        16: "/icons/icon16.png",
        48: "/icons/icon48.png",
      },
    },
  },
});
