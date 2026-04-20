# WoW Admin – AzerothCore Admin Tool

A desktop application (Electron + Node.js + TypeScript) for administering an
[AzerothCore](https://www.azerothcore.org/) World of Warcraft server via SOAP
and direct database access.

## Features

### SOAP Console
- Connect to any AzerothCore worldserver with SOAP enabled
- Execute any server console command remotely
- Quick-command sidebar for common operations
- Command history (↑ / ↓ arrow keys)
- Color-coded success/error responses

### Database Editor (New!)
- **SQL Query Editor** - Execute raw SQL queries with syntax highlighting
- **Table Browser** - View and edit any table in the database
- **Keira-style Entity Workspace** - A dedicated editor column, generated SQL panel, and side rail for live preview + related data
- **Entity Editors** - Specialized editors for:
  - Creatures (`creature_template`)
  - Items (`item_template`)
  - Quests (`quest_template`)
  - Spells (`spell_dbc`)
  - Game Objects (`gameobject_template`)
  - NPC Vendors (`npc_vendor`)
  - Loot Tables (`creature_loot_template`)
  - SmartAI Scripts (`smart_scripts`)
- **Live Preview Rail** - Quality-coloured preview cards, summary stats, quick lookup links, and in-app visual reference media for supported entities
- **Related Data Rail** - View vendor, loot, and quest-adjacent rows from the current entity and jump directly into those records
- **Smart Selectors** - Search-and-apply pickers for common creature/item/quest reference fields
- **Connection Profiles** - Save and switch between multiple database connections
- **Query History** - Track and re-run previous queries
- **Export to CSV** - Export query results to clipboard

### Live Map (New!)
- Real-time canvas map showing all online player positions
- Continent switcher: Eastern Kingdoms, Kalimdor, Outland, Northrend
- Map backgrounds preserve their aspect ratio automatically to avoid stretching/deformation on resize
- Player dots colour-coded by WoW class; bot accounts dimmed
- **Click a dot or sidebar row to select a player** — shows name, level, race, class, and live coordinates
- Quick SOAP actions from the selection panel: Info, Freeze, Unfreeze, Summon, Kick, Ban
- Hover tooltip with player details
- Zoom controls with mouse wheel zoom, double-click zoom, drag-to-pan while zoomed, and quick reset back to `100%`
- Auto-refresh (5 s) with manual refresh; filter by real players, bots, or all, with bot detection resolved from account usernames when available
- Optional map image backgrounds: place `0.jpg`, `1.jpg`, `530.jpg`, `571.jpg` in `assets/maps/` (see `assets/maps/README.txt`)
- Requires a separate database connection to `acore_characters`

### Economy Monitor (New!)
- Dedicated **Economy** tab for monitoring the live in-game auction house and character wealth
- Search active auction-house listings by item name, item entry, or owner name
- View per-item market averages including listing count, total quantity, average unit buyout, and min/max unit pricing
- Look up any character's current gold directly from the connected characters database
- Overview cards surface active auction counts, unique items listed, average buyout pricing, total realm gold, and the richest tracked character
- Uses the connected `acore_characters` database for auction and gold data, plus the matching world database name for item names and quality metadata

### Remote Log Monitor (New!)
- Connect to a remote AzerothCore host over SSH/SFTP
- Scan `worldserver.conf` to discover configured `Logger.*` and `Appender.*` definitions
- Resolve `LogsDir`, packet log paths, file-based appender targets, and dynamic `%s` log patterns
- Pick a logger first, then choose from the live readable files currently associated with that logger for a much cleaner in-app tail workflow
- Flag unreadable configured targets and preview the latest log output directly in-app
- Optional live follow mode refreshes the selected log preview every few seconds for a lightweight `tail -f` workflow
- Save remote log connection details and follow-mode settings as part of an existing connection profile
- Works with password-based SSH/SFTP access today

### App Updates
- Automatically checks GitHub releases on startup for newer app versions
- Header status indicator shows current version, update availability, or check errors
- Manual **Check** button to refresh release status on demand
- **Open Release** button opens the latest GitHub release page in the default browser when an update is available

### Dashboard
- Server info at a glance (uptime, online players, peak)
- Quick actions for common server operations
- Activity log for tracking commands

### Player Management
- View online players with filtering and search
- Player level, race, and class populated automatically on list load
- Player details and moderation actions
- Kick, ban, mute, freeze, and more

## Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** ≥ 18 | https://nodejs.org |
| **AzerothCore worldserver** | SOAP must be enabled (see below) |
| **MySQL/MariaDB** | For database editing features |

### Enable SOAP on your worldserver

In your `worldserver.conf`, set:

```ini
SOAP.Enabled  = 1
SOAP.IP       = "127.0.0.1"
SOAP.Port     = 7878
```

You also need an account with security level **3** (or higher) to
authenticate. You can set this in the `account` table or with:

```
.account set sec <account> 3
```

### Database Access

For database editing features, you need MySQL/MariaDB credentials with read/write
access to your AzerothCore databases:

- `acore_world` - World database (creatures, items, quests, etc.)
- `acore_auth` - Auth database (accounts, permissions)
- `acore_characters` - Characters database (player data)

The **Economy** tab uses the `acore_characters` database for auction-house and character-money data, and derives the matching world database name (for example `acore_world`) to resolve item names and quality.

## Getting Started

```bash
# Install dependencies
npm install

# Build TypeScript and Tailwind CSS
npm run build:ts
npm run build:css

# Or build everything and start
npm start
```

## Usage

### SOAP Connection
1. Enter the **Host**, **Port**, **Username**, and **Password** in the
   connection bar.
2. Click **Connect** — the app will run `server info` to verify the connection.
3. Type commands in the console input or use the **Quick Commands** sidebar.
4. Press **Enter** or click **Send** to execute.

### Database Connection
1. Navigate to the **Database** tab.
2. Select the database type (World, Auth, or Characters).
3. Enter your MySQL connection details.
4. Click **Connect** to establish the database connection.
5. Use the table browser to explore tables, or use the SQL editor for queries.
6. Open the **Entity Editor** when you want a richer Keira-style workflow for template records instead of raw rows.

### Entity Editor
1. In the Database tab, switch to the **Entity Editor** subtab.
2. Select an entity type (Creature, Item, Quest, etc.).
3. Enter the entry/ID and click **Load**.
4. Use the form editor for field groups, the generated SQL panel for diff/full query review, and the right-side preview rail for quick validation.
5. Use selector buttons on supported reference fields to search for linked items, creatures, or quests without leaving the editor.
6. Review the **Related Data** panel to inspect nearby vendor/loot/reward rows and jump directly into linked records.
7. Edit fields and click **Save** to commit changes.

#### Entity Editor highlights

- **Live Preview** updates while you edit, including item quality colouring and richer item/creature/quest summary cards
- **Visual Reference Media** is fetched into the preview rail for supported entities so you can sanity-check what you loaded without leaving the app
- **Related Data** helps you move through connected rows faster when working on loot, vendors, or quest rewards
- **Quick links** let you open external references such as Wowhead in your default browser when deeper research is needed

### Live Map
1. Navigate to the **Live Map** tab.
2. Enter the `acore_characters` MySQL connection details in the map connection bar and click **Connect**.
3. Players on the selected continent appear as coloured dots (class colours) on the canvas.
4. Use the continent buttons to switch between Eastern Kingdoms, Kalimdor, Outland, and Northrend.
5. **Click a dot** or a row in the sidebar to select a player — a panel appears with their details and quick action buttons (Info, Freeze, Unfreeze, Summon, Kick, Ban). Actions are sent via the active SOAP connection.
6. Use the mouse wheel or **double-click** to zoom into the map; drag to pan while zoomed, or click the zoom percentage control to reset to `100%`.
7. Optionally place map image files (`0.jpg`, `1.jpg`, `530.jpg`, `571.jpg`) in `assets/maps/` for visual map backgrounds (see `assets/maps/README.txt`). The app preserves the image aspect ratio automatically.
8. To generate those from a WoW 3.3.5a client, run `npm run extract:maps -- --source /path/to/WoW` (or the npm shorthand `npm run extract:maps --source /path/to/WoW`) or point it at an extracted `World/Minimaps` folder.

### Remote Log Monitor
1. Navigate to the **Logs** tab.
2. Enter the remote SSH host, port, username, password, and the remote `worldserver.conf` path.
3. Click **Scan Remote Logs** to inspect `LogsDir`, appenders, loggers, packet log settings, and readable files.
4. Review the summary cards and warnings to spot unreadable configured paths, missing dynamic log matches, or directory access issues.
5. Use the **Logger** picker to choose the subsystem you want to inspect, then choose one of its currently available **Live File** entries.
6. Review the file details panel to confirm the resolved path, timestamp, size, and matched appender hints before loading the preview.
7. Enable **Live follow** if you want the preview to auto-refresh like a lightweight in-app `tail -f`, then choose the refresh interval that fits your server.
8. Save the connection profile if you want those remote log settings remembered alongside your SOAP/database details.

### Economy Monitor
1. Navigate to the **Economy** tab.
2. Enter the `acore_characters` MySQL connection details and click **Connect**.
3. Review the overview cards to see active auctions, unique listed items, average buyout values, and total character gold.
4. Use the search field to find auction-house rows by item name, numeric item entry, or owner name.
5. Review **Average Market Values** for quick per-item pricing averages and **Auction House Listings** for the live individual rows behind that market.
6. Use **Character Gold Lookup** to inspect the money held by a specific character.

#### Economy monitor notes

- Auction data comes from the AzerothCore `auctionhouse` and `item_instance` tables in the connected characters database.
- Item names and quality colours are resolved from the matching world database's `item_template` table.
- Search supports both fuzzy text matching and direct numeric item-entry lookup.

#### Remote log monitor notes

- The current remote log workflow uses **username/password SSH/SFTP authentication**.
- The app reads `worldserver.conf` remotely and infers log file locations from `LogsDir`, `Appender.*`, and `PacketLogFile`.
- Dynamic file appenders such as `gm_%s.log` are matched against the current contents of the resolved logs directory.
- Logger-to-file matching is resolved in-app, so the live file picker only shows files currently associated with the selected logger instead of every readable file in the logs directory.
- Live follow pauses automatically when you leave the **Logs** tab, so it does not keep polling in the background unnecessarily.

### App Updates
1. Launch the app normally.
2. The header automatically checks GitHub for the latest release and shows your current version.
3. If a newer release exists, the banner changes state and exposes an **Open Release** button.
4. Use **Check** any time to manually refresh the release status.

### Extracting map backgrounds from the WoW client

You can now generate the live-map backgrounds directly from WoW minimap tiles:

```bash
# From a WoW 3.3.5a client root (the extractor now reads WoW MPQs directly; external tools are only a fallback)
npm run extract:maps -- --source "/path/to/WoW 3.3.5a"

# npm shorthand also works
npm run extract:maps --source "/path/to/WoW 3.3.5a"

# Or from an already extracted World/Minimaps directory
npm run extract:maps -- --source "/path/to/World/Minimaps"
```

The extractor stitches the continent tiles and writes these files into `assets/maps/`:

- `0.jpg` — Eastern Kingdoms
- `1.jpg` — Kalimdor
- `530.jpg` — Outland
- `571.jpg` — Northrend

Useful flags:

- `--output /custom/dir` to write somewhere else
- `--quality 95` to tweak JPEG quality
- `--keep-workspace` to keep the raw extracted minimap tiles
- `--workspace ./tmp/minimaps` to control where temporary extraction files go

On Linux, note that some patch MPQs may be malformed or some minimap tiles may be corrupt in patched clients. The extractor now skips unreadable archives/tiles when possible and continues building the continent JPGs. If built-in extraction still cannot resolve your client, `7zz` remains a useful fallback, or you can extract `World/Minimaps` manually and point `--source` there.

## Project Structure

```
wow-admin/
├── package.json
├── tsconfig.json           # TypeScript configuration
├── tailwind.config.js      # Tailwind CSS configuration
├── esbuild.config.js       # Build configuration
├── src/
│   ├── main.ts             # Electron main process
│   ├── preload.ts          # Context bridge (IPC)
│   ├── soap-client.ts      # SOAP/HTTP client for AzerothCore
│   ├── config-store.ts     # Profile persistence
│   ├── database/
│   │   └── db-service.ts   # MySQL database service
│   └── types/
│       └── electron.ts     # TypeScript type definitions
├── renderer/
│   ├── index.html          # App UI
│   ├── styles.css          # Base styling
│   ├── styles/
│   │   ├── tailwind.css    # Tailwind input
│   │   └── output.css      # Generated CSS
│   └── scripts/
│       ├── app.ts          # Main frontend logic (SOAP, DB, map, economy, logs)
│       ├── types/
│       │   └── state.ts    # Application state types
│       └── utils/
│           ├── helpers.ts  # Utility functions
│           └── map-coords.ts # WoW coordinate conversion utilities
├── assets/
│   └── maps/               # Optional map background images (0.jpg, 1.jpg, 530.jpg, 571.jpg)
├── scripts/
│   └── extract-map-assets.mjs # WoW minimap tile extractor/stitcher for live map backgrounds
└── dist/                   # Compiled output
```

## Development

```bash
# Type checking
npm run typecheck

# Build TypeScript (watch mode)
npm run build:ts:watch

# Build Tailwind CSS (watch mode)
npm run build:css:watch

# Development mode
npm run dev
```

## Building for Distribution

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
npm run build:all    # Windows + Linux
```

On Windows, the packaging commands intentionally run through `scripts/package.js`,
which disables Electron Builder's `signAndEditExecutable` step so non-elevated
shells and CI jobs can still produce the NSIS/portable installers.

## Technology Stack

- **Electron** - Cross-platform desktop application
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **mysql2** - MySQL client with Promise support
- **esbuild** - Fast TypeScript bundler

## Inspiration

This project was inspired by [Keira3](https://github.com/azerothcore/Keira3),
an excellent database editor for AzerothCore. WoW Admin combines similar database
editing capabilities with SOAP console functionality for a complete server
administration toolkit.

## License

MIT
