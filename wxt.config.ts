import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "TabDump",
    version: "0.0.2",
    description: "Dump all your tabs that you'll never read again",
    permissions: ["tabs", "storage", "unlimitedStorage"],
    icons: {
      16: "/icons/icon16.png",
      48: "/icons/icon48.png",
      128: "/icons/icon128.png",
    },
    action: {
      default_title: "Dump all your tabs that you'll never read again",
      default_icon: {
        16: "/icons/icon16.png",
        48: "/icons/icon48.png",
      },
    },
    browser_specific_settings: {
      gecko: {
        id: "tabdump@eastsun.me",
        strict_min_version: "109.0",
        // @ts-expect-error
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
  },
});
