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
- **Entity Editors** - Specialized editors for:
  - Creatures (`creature_template`)
  - Items (`item_template`)
  - Quests (`quest_template`)
  - Spells (`spell_dbc`)
  - Game Objects (`gameobject_template`)
  - NPC Vendors (`npc_vendor`)
  - Loot Tables (`creature_loot_template`)
  - SmartAI Scripts (`smart_scripts`)
- **Connection Profiles** - Save and switch between multiple database connections
- **Query History** - Track and re-run previous queries
- **Export to CSV** - Export query results to clipboard

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

### Entity Editor
1. In the Database tab, switch to the **Entity Editor** subtab.
2. Select an entity type (Creature, Item, Quest, etc.).
3. Enter the entry/ID and click **Load**.
4. Edit fields and click **Save** to commit changes.

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
│       ├── app.ts          # Main frontend logic
│       ├── types/
│       │   └── state.ts    # Application state types
│       └── utils/
│           └── helpers.ts  # Utility functions
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
