# TabDump

> 🥟 Dump all your tabs that you'll never read again

## Features

- One-click save and close all tabs in the current window
- Automatic grouping by time or keywords
- Click any link to reopen tabs
- Restore entire groups with one click
- Export/Import backups

## Installation

### Chrome Web Store

> Coming soon!

### Firefox Add-ons

> Coming soon!

### Manual Installation

#### Chrome

1. Download the latest release
2. Open `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the extracted folder

#### Firefox

1. Download the latest Firefox release
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the `manifest.json` file

## Development

```bash
pnpm install

# Development mode
pnpm dev              # Chrome
pnpm dev:firefox      # Firefox

# Build for production
pnpm build            # Chrome
pnpm build:firefox    # Firefox

# Package for store
pnpm zip              # Chrome Web Store
pnpm zip:firefox      # Firefox AMO (includes source code)
```