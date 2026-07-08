# Get started with lore-web

lore-web is a self-hosted browser interface for the Lore version control system. This guide covers setup and basic use.

## Prerequisites

- Node.js 18 or later
- Lore CLI (installed separately or via `setup.bat` on Windows)

## Installation

### Windows

Double-click `setup.bat`. It checks for Node.js and the Lore CLI, installs anything missing, and pulls the SDK dependency. Then double-click `start.bat` to launch the app.

### macOS or Linux

```sh
npm install
npm start
```

The app opens automatically at `http://127.0.0.1:7420`.

## Add a repository

1. Click the **Add** button
2. Select a folder containing a Lore working copy (a folder with a `.lore/` subdirectory)
3. The repository appears in the list; click to view revisions, files, and diffs

## Configure the remote server

By default, lore-web manages local working copies. To use it as a collaborator accessing a host's server:

1. Click the **⚙** icon next to the lore-web logo
2. Enter the server URL (format: `lore://hostname:41337`)
3. Run `lore login lore://hostname:41337` in a terminal to authenticate
4. Click **Server repositories…** to browse and clone from the host

See [How to run lore-web](docs/how-to/run-lore-web.md) for additional setup details.

## Run tests

```sh
npm test
```

## Run headless (no browser)

```sh
npm run serve
```

The server listens on port 7420. Visit `http://127.0.0.1:7420` in any browser.
