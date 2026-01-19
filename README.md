# TabDump

A minimal Chrome/Firefox extension for saving all open tabs to read later.

## Features

- **One-click save**: Save all open tabs to a single page
- **Export/Import**: Backup and restore your tabs as JSON
- **Cross-browser**: Works on Chrome, Firefox, Edge, Safari
- **No dependencies**: Total size < 1.1 MB (including icons)

## Installation

### Chrome Web Store

Coming soon!

### Firefox Add-ons

Coming soon!

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
# Install dependencies
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

## Usage

- Click the extension icon to save all tabs
- Click a tab link to open it (removes from list)
- Click "Restore All" to reopen all tabs in a group
- Click "Delete" to remove a group
- Use "Export" to backup, "Import" to restore
